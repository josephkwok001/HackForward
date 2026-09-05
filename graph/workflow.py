from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from fallback import haystack_from
from nodes.action_card import run_action_card
from nodes.assess import run_assess
from nodes.retrieve import run_retrieve
from nodes.safety_gate import apply_urgent_gate
from state import ActionInput, ActionResult, AssessInput, AssessResult


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


def _invoke(graph, payload: dict, thread_id: str) -> dict:
    config = {"configurable": {"thread_id": thread_id}}
    try:
        return graph.invoke(payload, config)
    except TypeError:
        return graph.invoke(payload)


def invoke_assess(record: AssessInput) -> AssessResult:
    output = _invoke(GRAPH, {"record": record.model_dump()}, record.thread_id)
    return AssessResult.model_validate(output["result"])


def invoke_action(request: ActionInput) -> ActionResult:
    output = _invoke(ACTION_GRAPH, {"record": request.model_dump()}, request.thread_id)
    return ActionResult.model_validate(output["action"])
