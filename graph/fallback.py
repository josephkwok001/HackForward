import re

from state import AssessInput, AssessResult, RiskFlag, Stage

OFFICIAL = re.compile(
    r"\b(iras|ica|spf|police|ocbc|dbs|uob|posb|singpass|mom\b|cpf|imda|customs|immigration|fraud department|anti-?scam|your bank|official)\b",
    re.I,
)
TRANSFER = re.compile(
    r"\b(paynow|pay now|transfer|safe account|hot funds|move (?:your )?money|wire|send (?:the )?money|remaining balance)\b",
    re.I,
)
OTP = re.compile(r"\b(otp|one[ -]?time password|sms code|verification code|6[ -]?digit)\b", re.I)
REMOTE = re.compile(
    r"\b(anydesk|teamviewer|ultraviewer|remote access|screen ?share|install (?:this|the) app)\b",
    re.I,
)
LINK = re.compile(r"\b(click (?:this|the) link|https?://|bit\.ly|tinyurl)\b", re.I)
PRESSURE = re.compile(
    r"\b(do not hang up|stay on the line|don'?t tell anyone|do not inform|act now|immediately|within \d+ minutes|reply yes)\b",
    re.I,
)
RECOVERY = re.compile(r"\b(recover(?:y| your money)|recovery agent|get your money back|tracing fee)\b", re.I)
SENT = re.compile(
    r"\b(already (?:transferred|sent|paid)|i (?:sent|paid|transferred)|went through|money (?:has )?(?:left|gone))\b",
    re.I,
)
PENDING = re.compile(r"\b(about to (?:transfer|pay|send)|i started|transferring now|pending|i'?m about to)\b", re.I)
ON_CALL = re.compile(r"\b(still (?:on the )?(?:call|line|chat)|talking to them now)\b", re.I)
CLICKED = re.compile(r"\b(i (?:clicked|opened|tapped)|already clicked)\b", re.I)
INSTALLED = re.compile(r"\b(i installed|already installed|they can see (?:my )?screen)\b", re.I)
OTP_DONE = re.compile(r"\b(i (?:typed|entered|gave|shared) (?:the )?(?:otp|code)|told them the (?:otp|code))\b", re.I)

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


def haystack_from(record: AssessInput) -> str:
    events = " ".join(event.observation for event in record.events_and_timeline)
    facts = " ".join(record.facts_shared)
    return f"{events}\n{facts}\n{record.incident_type}"


def prefer_safer(next_stage: Stage, prior: Stage | None) -> Stage:
    if not prior:
        return next_stage
    return next_stage if STAGE_RANK[next_stage] >= STAGE_RANK[prior] else prior


def classify_stage(text: str, flags: list[RiskFlag]) -> Stage:
    if "funds_already_moved" in flags or SENT.search(text):
        return "money_sent"
    if "payment_in_progress" in flags or PENDING.search(text):
        return "payment_pending"
    if OTP_DONE.search(text):
        return "otp_shared"
    if INSTALLED.search(text):
        return "app_installed"
    if CLICKED.search(text):
        return "link_clicked"
    if RECOVERY.search(text):
        return "repeat_recovery"
    if "user_still_on_the_call" in flags or (
        PRESSURE.search(text) and (OFFICIAL.search(text) or TRANSFER.search(text))
    ):
        return "active_pressure"
    if LINK.search(text) and not CLICKED.search(text):
        return "suspicious_contact"
    if OFFICIAL.search(text) or TRANSFER.search(text) or OTP.search(text) or REMOTE.search(text):
        return "suspicious_contact"
    return "unknown"


def collect_flags(text: str) -> list[RiskFlag]:
    flags: list[RiskFlag] = []

    def add(flag: RiskFlag) -> None:
        if flag not in flags:
            flags.append(flag)

    if OFFICIAL.search(text):
        add("impersonating_official")
    if TRANSFER.search(text):
        add("requested_transfer")
    if OTP.search(text):
        add("requested_otp")
    if REMOTE.search(text):
        add("requested_remote_access")
    if SENT.search(text):
        add("funds_already_moved")
    if PENDING.search(text):
        add("payment_in_progress")
    if ON_CALL.search(text):
        add("user_still_on_the_call")
    return flags


def rules_assess(record: AssessInput) -> AssessResult:
    text = haystack_from(record)
    flags = collect_flags(text)
    stage = prefer_safer(classify_stage(text, flags), record.current_stage)
    questions: list[str] = []
    needs = False
    if "requested_transfer" in flags and "funds_already_moved" not in flags and "payment_in_progress" not in flags:
        questions = ["Have you already transferred any money?"]
        needs = True
        flags.append("insufficient_evidence")
    factors = [f"Rules baseline classified this as {stage.replace('_', ' ')}."]
    if flags:
        factors.append("Keyword signals: " + ", ".join(flags[:3]) + ".")
    notes = ["Model skipped. Used the keyword rules baseline."]
    if record.redaction_notice:
        notes.append(record.redaction_notice)
    return AssessResult(
        thread_id=record.thread_id,
        current_stage=stage,
        risk_flags=flags,
        needs_clarification=needs,
        unanswered_questions=questions,
        decision_factors=factors[:3],
        uncertainty_notes=notes,
        source="rules",
        loop_count=record.loop_count + 1,
    )
