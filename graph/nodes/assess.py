import os

from envload import load_env
from langchain_core.messages import HumanMessage, SystemMessage

from fallback import rules_assess
from prompts.assess import SYSTEM_PROMPT, user_payload
from state import AssessInput, AssessLLMOutput, AssessResult


def bedrock_configured() -> bool:
    load_env()
    model = os.getenv("BEDROCK_MODEL_ID", "").strip()
    profile = os.getenv("AWS_PROFILE", "").strip()
    key = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
    secret = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
    return bool(model and (profile or (key and secret)))


def _invoke_bedrock(record: AssessInput) -> AssessLLMOutput:
    from langchain_aws import ChatBedrockConverse

    model_id = os.environ["BEDROCK_MODEL_ID"]
    region = os.getenv("AWS_REGION", "us-east-1")
    llm = ChatBedrockConverse(model=model_id, region_name=region, temperature=0)
    structured = llm.with_structured_output(AssessLLMOutput)
    return structured.invoke(
        [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_payload(record)),
        ]
    )


def run_assess(record: AssessInput) -> AssessResult:
    if not bedrock_configured():
        return rules_assess(record)
    try:
        raw = _invoke_bedrock(record)
        if raw.current_stage not in raw.candidate_stages and raw.candidate_stages:
            raw.candidate_stages = [*raw.candidate_stages[:1], raw.current_stage][:2]
        return AssessResult(
            thread_id=record.thread_id,
            current_stage=raw.current_stage,
            risk_flags=raw.risk_flags,
            needs_clarification=raw.needs_clarification,
            unanswered_questions=raw.unanswered_questions[:1],
            decision_factors=raw.decision_factors[:3],
            uncertainty_notes=raw.uncertainty_notes,
            source="bedrock",
            loop_count=record.loop_count + 1,
        )
    except Exception as error:
        fallback = rules_assess(record)
        notes = [
            *fallback.uncertainty_notes,
            f"Bedrock call failed ({type(error).__name__}). Used rules baseline.",
        ]
        return fallback.model_copy(update={"uncertainty_notes": notes})
