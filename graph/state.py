import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Stage = Literal[
    "suspicious_contact",
    "active_pressure",
    "link_clicked",
    "app_installed",
    "otp_shared",
    "payment_pending",
    "money_sent",
    "repeat_recovery",
    "unknown",
]

RiskFlag = Literal[
    "requested_transfer",
    "requested_otp",
    "requested_remote_access",
    "impersonating_official",
    "payment_in_progress",
    "funds_already_moved",
    "user_still_on_the_call",
    "insufficient_evidence",
]

STAGE_VALUES = (
    "suspicious_contact",
    "active_pressure",
    "link_clicked",
    "app_installed",
    "otp_shared",
    "payment_pending",
    "money_sent",
    "repeat_recovery",
    "unknown",
)

RISK_VALUES = (
    "requested_transfer",
    "requested_otp",
    "requested_remote_access",
    "impersonating_official",
    "payment_in_progress",
    "funds_already_moved",
    "user_still_on_the_call",
    "insufficient_evidence",
)


class TimelineEvent(BaseModel):
    time_hint: str = ""
    actor: str = ""
    observation: str = ""


_CARD_NUMBER = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
_CODE = re.compile(r"\b\d{6}\b")
_CODE_CONTEXT = re.compile(r"\b(otp|one[ -]?time|sms code|verification code|code)\b", re.I)
_PASSWORD = re.compile(r"\bpassword\s*[:=]\s*\S+", re.I)
_PIN = re.compile(r"\bpin\s*[:=]\s*\d+", re.I)
_UNTRUSTED_INSTRUCTION = re.compile(
    r"ignore (all )?(previous|prior|above) instructions|system prompt|you are now",
    re.I,
)


def _scrub(text: str) -> tuple[str, bool]:
    next_text = text
    next_text, card_changed = _CARD_NUMBER.subn("[redacted card number]", next_text)
    code_changed = bool(_CODE_CONTEXT.search(next_text))
    if code_changed:
        next_text, _ = _CODE.subn("[redacted code]", next_text)
    next_text, password_changed = _PASSWORD.subn("password: [redacted]", next_text)
    next_text, pin_changed = _PIN.subn("PIN: [redacted]", next_text)
    next_text, instruction_changed = _UNTRUSTED_INSTRUCTION.subn(
        "[untrusted instruction removed]", next_text
    )
    return next_text, bool(
        card_changed or code_changed or password_changed or pin_changed or instruction_changed
    )


def _scrub_input(value: Any) -> tuple[dict[str, Any], bool]:
    data = dict(value) if isinstance(value, dict) else {}
    changed = False
    facts = []
    for fact in data.get("facts_shared", []) or []:
        cleaned, was_changed = _scrub(str(fact))
        facts.append(cleaned)
        changed = changed or was_changed
    data["facts_shared"] = facts

    events = []
    for event in data.get("events_and_timeline", []) or []:
        item = (
            event.model_dump()
            if isinstance(event, TimelineEvent)
            else dict(event)
            if isinstance(event, dict)
            else {}
        )
        cleaned, was_changed = _scrub(str(item.get("observation", "")))
        item["observation"] = cleaned
        events.append(item)
        changed = changed or was_changed
    data["events_and_timeline"] = events

    if isinstance(data.get("incident_type"), str):
        data["incident_type"], was_changed = _scrub(data["incident_type"])
        changed = changed or was_changed
    if changed:
        data["redaction_notice"] = "Sensitive or instruction-like content was removed before assessment."
    return data, changed


class AssessInput(BaseModel):
    """Feature 1 record in; extra intake fields from the UI are ignored."""

    model_config = ConfigDict(extra="ignore")

    thread_id: str
    facts_shared: list[str] = Field(default_factory=list)
    events_and_timeline: list[TimelineEvent] = Field(default_factory=list)
    incident_type: str = "unknown"
    current_stage: Stage | None = None
    loop_count: int = 0
    redaction_notice: str | None = None

    @model_validator(mode="before")
    @classmethod
    def scrub_untrusted_input(cls, value: Any) -> Any:
        if isinstance(value, cls):
            return value
        data, _ = _scrub_input(value)
        return data


class AssessLLMOutput(BaseModel):
    candidate_stages: list[Stage] = Field(default_factory=list, max_length=2)
    current_stage: Stage
    risk_flags: list[RiskFlag] = Field(default_factory=list)
    needs_clarification: bool = False
    unanswered_questions: list[str] = Field(default_factory=list)
    decision_factors: list[str] = Field(default_factory=list)
    uncertainty_notes: list[str] = Field(default_factory=list)

    @field_validator("unanswered_questions")
    @classmethod
    def at_most_one_question(cls, value: list[str]) -> list[str]:
        return value[:1]

    @field_validator("decision_factors")
    @classmethod
    def at_most_three_factors(cls, value: list[str]) -> list[str]:
        return value[:3]


EscalationRoute = Literal[
    "none",
    "bank",
    "scamshield_or_1799",
    "police",
    "trusted_contact",
]


class OfficialSource(BaseModel):
    id: str
    title: str
    url: str
    excerpt: str = ""


class NextAction(BaseModel):
    title: str
    steps: list[str] = Field(default_factory=list)
    source_title: str
    source_url: str

    @field_validator("steps")
    @classmethod
    def one_to_three_steps(cls, value: list[str]) -> list[str]:
        return value[:3]


class ActionInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    thread_id: str
    current_stage: Stage
    risk_flags: list[RiskFlag] = Field(default_factory=list)


class ActionResult(BaseModel):
    thread_id: str
    current_stage: Stage
    selected_next_action: NextAction
    escalation_route: EscalationRoute
    official_sources: list[OfficialSource] = Field(default_factory=list)
    decision_factors: list[str] = Field(default_factory=list)
    retrieval_failed: bool = False
    source: Literal["playbook"] = "playbook"

    @field_validator("decision_factors")
    @classmethod
    def at_most_three_factors(cls, value: list[str]) -> list[str]:
        return value[:3]


class AssessResult(BaseModel):
    thread_id: str
    current_stage: Stage
    risk_flags: list[RiskFlag] = Field(default_factory=list)
    needs_clarification: bool = False
    unanswered_questions: list[str] = Field(default_factory=list)
    decision_factors: list[str] = Field(default_factory=list)
    uncertainty_notes: list[str] = Field(default_factory=list)
    source: Literal["bedrock", "rules"] = "rules"
    loop_count: int = 0
    # Safe observability only; do not return the stored conversation itself.
    memory_turn_count: int = 0

    @field_validator("unanswered_questions")
    @classmethod
    def at_most_one_question(cls, value: list[str]) -> list[str]:
        return value[:1]

    @field_validator("decision_factors")
    @classmethod
    def at_most_three_factors(cls, value: list[str]) -> list[str]:
        return value[:3]
