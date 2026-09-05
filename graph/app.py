import os

from envload import load_env
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from nodes.assess import bedrock_configured
from state import ActionInput, ActionResult, AssessInput, AssessResult
from workflow import invoke_action, invoke_assess, memory_status

app = FastAPI(title="ScamSafe assess", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "ScamSafe assess",
        "health": "/health",
        "assess": "POST /assess",
        "action": "POST /action",
        "memory": "GET /memory/{thread_id}",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "bedrock": "configured" if bedrock_configured() else "off",
        "region": os.getenv("AWS_REGION", ""),
        "model": os.getenv("BEDROCK_MODEL_ID", ""),
    }


@app.post("/assess", response_model=AssessResult)
def assess(record: AssessInput) -> AssessResult:
    return invoke_assess(record)


@app.post("/action", response_model=ActionResult)
def action(request: ActionInput) -> ActionResult:
    return invoke_action(request)


@app.post("/invocations", response_model=AssessResult)
def invocations(record: AssessInput) -> AssessResult:
    return invoke_assess(record)


@app.get("/memory/{thread_id}")
def get_memory(thread_id: str) -> dict[str, str | int]:
    status = memory_status(thread_id)
    if status is None:
        raise HTTPException(status_code=404, detail="No memory exists for this thread_id.")
    return status
