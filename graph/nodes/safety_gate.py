import re

from state import AssessResult, RiskFlag, Stage

FACT_OTP_DONE = re.compile(r"otp|verification code|typed the (?:otp|code)|shared the code", re.I)
FACT_SENT = re.compile(r"already (?:transferred|sent|paid)|money may already|went through", re.I)
FACT_PENDING = re.compile(r"about to|in progress|transferring|paynow|transfer", re.I)
FACT_REMOTE = re.compile(r"remote access|anydesk|teamviewer|screen", re.I)

STAGE_RANK: dict[Stage, int] = {
    "unknown": 0,
    "suspicious_contact": 1,
    "link_clicked": 2,
    "repeat_recovery": 2,
    "active_pressure": 3,
    "app_installed": 4,
    "otp_shared": 5,
    "payment_pending": 6,
    "money_sent": 7,
}


def _raise(current: Stage, floor: Stage) -> Stage:
    return floor if STAGE_RANK[floor] > STAGE_RANK[current] else current


def apply_urgent_gate(result: AssessResult, fact_blob: str) -> AssessResult:
    flags = list(result.risk_flags)
    stage = result.current_stage

    def add(flag: RiskFlag) -> None:
        if flag not in flags:
            flags.append(flag)

    if FACT_SENT.search(fact_blob):
        add("funds_already_moved")
        stage = _raise(stage, "money_sent")
    elif "payment_in_progress" in flags or (
        FACT_PENDING.search(fact_blob) and "requested_transfer" in flags
    ):
        if "about to" in fact_blob.lower() or "in progress" in fact_blob.lower():
            add("payment_in_progress")
            stage = _raise(stage, "payment_pending")
    if FACT_OTP_DONE.search(fact_blob) and ("requested_otp" in flags or "otp" in fact_blob.lower()):
        if re.search(r"typed|entered|shared|gave", fact_blob, re.I):
            stage = _raise(stage, "otp_shared")
    if FACT_REMOTE.search(fact_blob) and re.search(r"installed|can see", fact_blob, re.I):
        add("requested_remote_access")
        stage = _raise(stage, "app_installed")

    notes = list(result.uncertainty_notes)
    if stage != result.current_stage:
        notes.append("Safety gate raised the stage from urgent fact signals.")

    return result.model_copy(update={"current_stage": stage, "risk_flags": flags, "uncertainty_notes": notes})
