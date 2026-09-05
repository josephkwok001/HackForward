from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from fallback import haystack_from
from nodes.action_card import run_action_card
from nodes.assess import run_assess
from nodes.retrieve import run_retrieve
from nodes.safety_gate import apply_urgent_gate
from state import ActionInput, ActionResult, AssessInput, AssessResult, TimelineEvent


class GraphState(TypedDict, total=False):
    record: dict[str, Any]
    result: dict[str, Any]
    retrieved: dict[str, Any]
    action: dict[str, Any]


def _assess_node(state: GraphState) -> GraphState:
    record = AssessInput.model_validate(state["record"])
    result = run_assess(record)
    return {"record": state["record"], "result": result.model_dump()}


def _gate_node(state: GraphState) -> GraphState:
    record = AssessInput.model_validate(state["record"])
    result = AssessResult.model_validate(state["result"])
    gated = apply_urgent_gate(result, haystack_from(record))
    gated = gated.model_copy(update={"memory_turn_count": len(record.events_and_timeline)})
    return {"record": state["record"], "result": gated.model_dump()}


def _retrieve_node(state: GraphState) -> GraphState:
    request = ActionInput.model_validate(state["record"])
    retrieved = run_retrieve(request)
    return {**state, "retrieved": retrieved}


def _action_node(state: GraphState) -> GraphState:
    action = run_action_card(state["retrieved"])
    return {**state, "action": action.model_dump()}


def _checkpointer():
    try:
        from langgraph.checkpoint.memory import InMemorySaver

        return InMemorySaver()
    except Exception:
        try:
            from langgraph.checkpoint.memory import MemorySaver

            return MemorySaver()
        except Exception:
            return None


def build_assess_graph():
    builder = StateGraph(GraphState)
    builder.add_node("assess", _assess_node)
    builder.add_node("safety_gate", _gate_node)
    builder.add_edge(START, "assess")
    builder.add_edge("assess", "safety_gate")
    builder.add_edge("safety_gate", END)
    return builder.compile(checkpointer=_checkpointer())


def build_action_graph():
    builder = StateGraph(GraphState)
    builder.add_node("retrieve", _retrieve_node)
    builder.add_node("action_card", _action_node)
    builder.add_edge(START, "retrieve")
    builder.add_edge("retrieve", "action_card")
    builder.add_edge("action_card", END)
    return builder.compile(checkpointer=_checkpointer())


GRAPH = build_assess_graph()
ACTION_GRAPH = build_action_graph()
MAX_MEMORY_EVENTS = 40


def _invoke(graph, payload: dict, thread_id: str) -> dict:
    config = {"configurable": {"thread_id": thread_id}}
    try:
        return graph.invoke(payload, config)
    except TypeError:
        return graph.invoke(payload)


def _checkpoint_record(thread_id: str) -> AssessInput | None:
    """Load the last record saved for this thread by LangGraph."""
    config = {"configurable": {"thread_id": thread_id}}
    try:
        snapshot = GRAPH.get_state(config)
    except (AttributeError, TypeError, ValueError):
        return None
    values = snapshot.values if snapshot else {}
    saved = values.get("record") if isinstance(values, dict) else None
    if not saved:
        return None
    try:
        record = AssessInput.model_validate(saved)
        result = AssessResult.model_validate(values.get("result", {}))
        return record.model_copy(
            update={
                "current_stage": result.current_stage,
                "loop_count": max(record.loop_count, result.loop_count),
            }
        )
    except (TypeError, ValueError):
        return None


def _unique_events(events: list[TimelineEvent]) -> list[TimelineEvent]:
    seen: set[tuple[str, str, str]] = set()
    result: list[TimelineEvent] = []
    for event in events:
        key = (event.time_hint, event.actor, event.observation)
        if key not in seen:
            seen.add(key)
            result.append(event)
    return result


def merge_thread_memory(previous: AssessInput | None, incoming: AssessInput) -> AssessInput:
    """Combine a new turn with the checkpointed conversation for its thread.

    The graph receives the merged record, so both the rules baseline and a
    configured Bedrock assess call can use the complete timeline on every turn.
    A thread id is the isolation boundary; records from another thread are
    never merged.
    """
    if previous is None:
        return incoming
    if previous.thread_id != incoming.thread_id:
        raise ValueError("Cannot merge records from different threads.")

    incident_type = incoming.incident_type
    if incident_type == "unknown" and previous.incident_type != "unknown":
        incident_type = previous.incident_type

    return AssessInput(
        thread_id=incoming.thread_id,
        facts_shared=list(dict.fromkeys([*previous.facts_shared, *incoming.facts_shared]))[-MAX_MEMORY_EVENTS:],
        events_and_timeline=_unique_events([
            *previous.events_and_timeline,
            *incoming.events_and_timeline,
        ])[-MAX_MEMORY_EVENTS:],
        incident_type=incident_type,
        current_stage=incoming.current_stage or previous.current_stage,
        loop_count=max(previous.loop_count, incoming.loop_count),
        redaction_notice=incoming.redaction_notice or previous.redaction_notice,
    )


def invoke_assess(record: AssessInput) -> AssessResult:
    remembered = _checkpoint_record(record.thread_id)
    record = merge_thread_memory(remembered, record)
    output = _invoke(GRAPH, {"record": record.model_dump()}, record.thread_id)
    result = AssessResult.model_validate(output["result"])
    if result.memory_turn_count == 0:
        result = result.model_copy(update={"memory_turn_count": len(record.events_and_timeline)})
    return result


def invoke_action(request: ActionInput) -> ActionResult:
    output = _invoke(ACTION_GRAPH, {"record": request.model_dump()}, request.thread_id)
    return ActionResult.model_validate(output["action"])


def memory_status(thread_id: str) -> dict[str, str | int] | None:
    """Return safe memory metadata without exposing stored conversation text."""
    record = _checkpoint_record(thread_id)
    if record is None:
        return None
    return {
        "thread_id": thread_id,
        "memory_turn_count": len(record.events_and_timeline),
        "last_stage": record.current_stage or "unknown",
        "loop_count": record.loop_count,
    }
