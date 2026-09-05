from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from fallback import haystack_from
from nodes.assess import run_assess
from nodes.safety_gate import apply_urgent_gate
from state import AssessInput, AssessResult


class GraphState(TypedDict, total=False):
    record: dict[str, Any]
    result: dict[str, Any]


def _assess_node(state: GraphState) -> GraphState:
    record = AssessInput.model_validate(state["record"])
    result = run_assess(record)
    return {"record": state["record"], "result": result.model_dump()}


def _gate_node(state: GraphState) -> GraphState:
    record = AssessInput.model_validate(state["record"])
    result = AssessResult.model_validate(state["result"])
    gated = apply_urgent_gate(result, haystack_from(record))
    return {"record": state["record"], "result": gated.model_dump()}


def build_graph():
    checkpointer = None
    try:
        from langgraph.checkpoint.memory import InMemorySaver

        checkpointer = InMemorySaver()
    except Exception:
        try:
            from langgraph.checkpoint.memory import MemorySaver

            checkpointer = MemorySaver()
        except Exception:
            checkpointer = None

    builder = StateGraph(GraphState)
    builder.add_node("assess", _assess_node)
    builder.add_node("safety_gate", _gate_node)
    builder.add_edge(START, "assess")
    builder.add_edge("assess", "safety_gate")
    builder.add_edge("safety_gate", END)
    return builder.compile(checkpointer=checkpointer)


GRAPH = build_graph()


def invoke_assess(record: AssessInput) -> AssessResult:
    config = {"configurable": {"thread_id": record.thread_id}}
    try:
        output = GRAPH.invoke({"record": record.model_dump()}, config)
    except TypeError:
        output = GRAPH.invoke({"record": record.model_dump()})
    return AssessResult.model_validate(output["result"])
