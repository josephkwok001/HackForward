import os

from envload import load_env
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from nodes.assess import bedrock_configured
from state import AssessInput, AssessResult
from workflow import invoke_assess

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


@app.post("/invocations", response_model=AssessResult)
def invocations(record: AssessInput) -> AssessResult:
    return invoke_assess(record)
