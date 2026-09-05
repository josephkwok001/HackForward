from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class AssessInput(BaseModel):
    """Feature 1 record in; extra intake fields from the UI are ignored."""

    model_config = ConfigDict(extra="ignore")

    thread_id: str
    facts_shared: list[str] = Field(default_factory=list)
    events_and_timeline: list[TimelineEvent] = Field(default_factory=list)
    incident_type: str = "unknown"
    current_stage: Stage | None = None
    loop_count: int = 0


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

    @field_validator("unanswered_questions")
    @classmethod
    def at_most_one_question(cls, value: list[str]) -> list[str]:
        return value[:1]

    @field_validator("decision_factors")
    @classmethod
    def at_most_three_factors(cls, value: list[str]) -> list[str]:
        return value[:3]
