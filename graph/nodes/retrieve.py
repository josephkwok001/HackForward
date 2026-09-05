from sources import ALLOWED_URLS, action_pack, pick_route, retrieve_official
from state import ActionInput, OfficialSource


def run_retrieve(request: ActionInput) -> dict:
    route = pick_route(request.current_stage, request.risk_flags)
    pack = action_pack(request.current_stage, route)
    sources = retrieve_official(request.current_stage, route)
    failed = not sources or any(item.url not in ALLOWED_URLS for item in sources)
    if failed:
        sources = []
    return {
        "thread_id": request.thread_id,
        "current_stage": request.current_stage,
        "risk_flags": request.risk_flags,
        "escalation_route": route,
        "official_sources": [item.model_dump() for item in sources],
        "retrieval_failed": failed,
        "pack": {
            "action": pack["action"].model_dump(),
            "why": pack["why"],
        },
    }
