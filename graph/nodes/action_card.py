from sources import ALLOWED_URLS, SOURCES, action_pack
from state import ActionResult, NextAction, OfficialSource


def run_action_card(retrieved: dict) -> ActionResult:
    pack = action_pack(retrieved["current_stage"], retrieved["escalation_route"])
    action = NextAction.model_validate(retrieved.get("pack", {}).get("action") or pack["action"])
    if action.source_url not in ALLOWED_URLS:
        fallback = SOURCES["scamshield"]
        action = action.model_copy(update={"source_title": fallback.title, "source_url": fallback.url})
    sources = [OfficialSource.model_validate(item) for item in retrieved.get("official_sources") or []]
    if retrieved.get("retrieval_failed") or not sources:
        sources = pack["sources"]
    why = list(retrieved.get("pack", {}).get("why") or pack["why"])
    if retrieved.get("retrieval_failed"):
        why = [*why[:2], "Used the official playbook after retrieval_failed."]
    return ActionResult(
        thread_id=retrieved["thread_id"],
        current_stage=retrieved["current_stage"],
        selected_next_action=action,
        escalation_route=retrieved["escalation_route"],
        official_sources=sources,
        decision_factors=why[:3],
        retrieval_failed=bool(retrieved.get("retrieval_failed")),
        source="playbook",
    )
