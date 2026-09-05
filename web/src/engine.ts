import { actionFor } from "./sources";
import { extractIncident, redactSensitive } from "./intake";
import type {
  AssessInput,
  ClarifyPrompt,
  EscalationRoute,
  IncidentState,
  RiskFlag,
  Stage,
} from "./types";

const LOOP_LIMIT = 5;

const OFFICIAL =
  /\b(iras|ica|spf|police|ocbc|dbs|uob|posb|singpass|mom\b|cpf|imda|customs|immigration|fraud department|anti-?scam|your bank)\b/i;
const TRANSFER =
  /\b(paynow|pay now|transfer|safe account|hot funds|move (?:your )?money|wire|send (?:the )?money|remaining balance)\b/i;
const OTP = /\b(otp|one[ -]?time password|sms code|verification code|6[ -]?digit)\b/i;
const REMOTE = /\b(anydesk|teamviewer|ultraviewer|remote access|screen ?share|install (?:this|the) app)\b/i;
const LINK = /\b(click (?:this|the) link|https?:\/\/|bit\.ly|tinyurl)\b/i;
const PRESSURE =
  /\b(do not hang up|stay on the line|don'?t tell anyone|do not inform|act now|immediately|within \d+ minutes|reply yes)\b/i;
const RECOVERY = /\b(recover(?:y| your money)|recovery agent|get your money back|tracing fee)\b/i;
const SENT = /\b(already (?:transferred|sent|paid)|i (?:sent|paid|transferred)|went through|money (?:has )?(?:left|gone))\b/i;
const PENDING = /\b(about to (?:transfer|pay|send)|i started|transferring now|pending|i'?m about to)\b/i;
const ON_CALL = /\b(still (?:on the )?(?:call|line|chat)|talking to them now)\b/i;
const CLICKED = /\b(i (?:clicked|opened|tapped)|already clicked)\b/i;
const INSTALLED = /\b(i installed|already installed|they can see (?:my )?screen)\b/i;
const OTP_DONE = /\b(i (?:typed|entered|gave|shared) (?:the )?(?:otp|code)|told them the (?:otp|code))\b/i;

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function pushFlag(flags: RiskFlag[], flag: RiskFlag) {
  if (!flags.includes(flag)) flags.push(flag);
}

const STAGE_RANK: Record<Stage, number> = {
  unknown: 0,
  suspicious_contact: 1,
  link_clicked: 2,
  repeat_recovery: 2,
  active_pressure: 3,
  app_installed: 4,
  otp_shared: 5,
  payment_pending: 6,
  money_sent: 7,
};

function preferSaferStage(next: Stage, prior?: Stage): Stage {
  if (!prior) return next;
  return STAGE_RANK[next] >= STAGE_RANK[prior] ? next : prior;
}

function classifyStage(haystack: string, flags: RiskFlag[]): Stage {
  if (flags.includes("funds_already_moved") || SENT.test(haystack)) return "money_sent";
  if (flags.includes("payment_in_progress") || PENDING.test(haystack)) return "payment_pending";
  if (OTP_DONE.test(haystack)) return "otp_shared";
  if (INSTALLED.test(haystack)) return "app_installed";
  if (CLICKED.test(haystack)) return "link_clicked";
  if (RECOVERY.test(haystack)) return "repeat_recovery";
  if (
    flags.includes("user_still_on_the_call") ||
    (PRESSURE.test(haystack) && (OFFICIAL.test(haystack) || TRANSFER.test(haystack)))
  ) {
    return "active_pressure";
  }
  if (LINK.test(haystack) && !CLICKED.test(haystack)) return "suspicious_contact";
  if (OFFICIAL.test(haystack) || TRANSFER.test(haystack) || OTP.test(haystack) || REMOTE.test(haystack)) {
    return "suspicious_contact";
  }
  return "unknown";
}

function pickRoute(stage: Stage, flags: RiskFlag[]): EscalationRoute {
  if (stage === "money_sent") return "police";
  if (stage === "payment_pending" || stage === "otp_shared" || flags.includes("payment_in_progress")) {
    return "bank";
  }
  if (stage === "app_installed" || stage === "active_pressure") return "scamshield_or_1799";
  if (stage === "repeat_recovery") return "scamshield_or_1799";
  return "scamshield_or_1799";
}

const MONEY_QUESTION = "Have you already transferred any money?";
const CALL_QUESTION = "Are you still on the call or chat with them?";
const OTP_QUESTION = "Did you type an OTP or SMS code into a page, or tell it to them?";
const ASK_QUESTION = "What did they ask you to do?";

const PROMPTS: Record<string, ClarifyPrompt> = {
  [MONEY_QUESTION]: {
    question: MONEY_QUESTION,
    choices: [
      { id: "not_yet", label: "Not yet" },
      { id: "about_to", label: "I'm about to / I started" },
      { id: "sent", label: "Yes, it went through" },
    ],
  },
  [CALL_QUESTION]: {
    question: CALL_QUESTION,
    choices: [
      { id: "still_talking", label: "Yes, still talking" },
      { id: "stepped_away", label: "No, I stepped away" },
    ],
  },
  [OTP_QUESTION]: {
    question: OTP_QUESTION,
    choices: [
      { id: "otp_no", label: "No" },
      { id: "otp_yes", label: "Yes" },
    ],
  },
  [ASK_QUESTION]: {
    question: ASK_QUESTION,
    choices: [
      { id: "ask_money", label: "Send money or PayNow" },
      { id: "ask_otp", label: "Share a code / OTP" },
      { id: "ask_app", label: "Install an app or share my screen" },
      { id: "ask_unclear", label: "I'm not sure yet" },
    ],
  },
};

export function promptForQuestion(question: string): ClarifyPrompt | null {
  return PROMPTS[question] ?? null;
}

export function clarificationFor(state: Pick<IncidentState, "risk_flags" | "current_stage" | "raw_evidence_refs">, haystack: string): ClarifyPrompt | null {
  const moneyKnown =
    state.risk_flags.includes("funds_already_moved") ||
    state.risk_flags.includes("payment_in_progress") ||
    SENT.test(haystack) ||
    PENDING.test(haystack) ||
    /not yet transferred/i.test(haystack);

  if (state.risk_flags.includes("requested_transfer") && !moneyKnown) {
    return PROMPTS[MONEY_QUESTION];
  }

  const callKnown =
    state.risk_flags.includes("user_still_on_the_call") ||
    /stepped away|not (?:on the )?(?:call|line)/i.test(haystack);
  if (state.current_stage === "active_pressure" && !callKnown) {
    return PROMPTS[CALL_QUESTION];
  }

  const otpKnown = OTP_DONE.test(haystack) || /did not share an otp/i.test(haystack);
  if (state.risk_flags.includes("requested_otp") && !otpKnown && state.current_stage !== "otp_shared") {
    return PROMPTS[OTP_QUESTION];
  }

  const onlyScreenshot = state.raw_evidence_refs.some((ref) => ref.startsWith("screenshot:")) && haystack.trim().length < 40;
  if (onlyScreenshot || state.current_stage === "unknown") {
    return PROMPTS[ASK_QUESTION];
  }

  return null;
}

function applyAnswer(haystack: string, answer?: AssessInput["answer"]): string {
  if (!answer) return haystack;
  const extras: Record<string, string> = {
    not_yet: "not yet transferred",
    about_to: "I'm about to transfer",
    sent: "I already transferred the money, it went through",
    still_talking: "still on the call talking to them now",
    stepped_away: "I stepped away, not on the call",
    otp_no: "I did not share an OTP",
    otp_yes: "I typed the OTP and shared the code",
    ask_money: "they asked me to send money via PayNow",
    ask_otp: "they asked me for an OTP verification code",
    ask_app: "they asked me to install a remote access app",
    ask_unclear: "I'm not sure what they want yet",
  };
  return `${haystack}\n${extras[answer.value] ?? answer.value}`;
}

export function assess(input: AssessInput): IncidentState {
  const { text, notice } = redactSensitive(input.text);
  const prior = input.prior;
  const answerText = applyAnswer("", input.answer).trim();
  const extraction = extractIncident(
    {
      thread_id: prior?.thread_id,
      mode: input.mode,
      text: text.trim() || answerText,
      evidence_ref: input.fileName ? `screenshot:${input.fileName}` : undefined,
    },
    prior
      ? {
          thread_id: prior.thread_id,
          raw_evidence_refs: prior.raw_evidence_refs,
          events_and_timeline: prior.events_and_timeline,
          facts_shared: prior.facts_shared,
          incident_type: prior.incident_type,
          uncertainty_notes: prior.uncertainty_notes,
          redaction_notice: prior.redaction_notice,
        }
      : undefined,
  );
  const thread_id = extraction.thread_id;
  const refs = extraction.raw_evidence_refs;

  let haystack = [text, input.fileName ?? "", applyAnswer("", input.answer)].join("\n");
  if (prior) {
    haystack = [
      haystack,
      prior.facts_shared.join(" "),
      prior.events_and_timeline.map((e) => e.observation).join(" "),
      prior.risk_flags.join(" "),
    ].join("\n");
  }
  haystack = applyAnswer(haystack, input.answer);

  const flags: RiskFlag[] = [...(prior?.risk_flags ?? [])];
  if (OFFICIAL.test(haystack)) pushFlag(flags, "impersonating_official");
  if (TRANSFER.test(haystack)) pushFlag(flags, "requested_transfer");
  if (OTP.test(haystack)) pushFlag(flags, "requested_otp");
  if (REMOTE.test(haystack)) pushFlag(flags, "requested_remote_access");
  if (SENT.test(haystack)) pushFlag(flags, "funds_already_moved");
  if (PENDING.test(haystack)) pushFlag(flags, "payment_in_progress");
  if (ON_CALL.test(haystack)) pushFlag(flags, "user_still_on_the_call");

  let stage = preferSaferStage(classifyStage(haystack, flags), prior?.current_stage);

  const clarify = input.answer
    ? null
    : clarificationFor(
        { risk_flags: flags, current_stage: stage, raw_evidence_refs: refs },
        haystack,
      );
  const loop_count = (prior?.loop_count ?? 0) + (prior ? 1 : 0);
  const forcedStop = loop_count >= LOOP_LIMIT;

  if (clarify && !forcedStop) {
    pushFlag(flags, "insufficient_evidence");
  } else {
    const idx = flags.indexOf("insufficient_evidence");
    if (idx >= 0) flags.splice(idx, 1);
  }

  if (forcedStop && stage === "unknown") stage = "suspicious_contact";

  const route = pickRoute(stage, flags);
  const { action, sources } = actionFor(stage, route);

  return {
    thread_id,
    raw_evidence_refs: refs.slice(-8),
    incident_type: extraction.incident_type,
    current_stage: stage,
    risk_flags: flags,
    events_and_timeline: extraction.events_and_timeline.slice(-12),
    facts_shared: extraction.facts_shared.slice(-8),
    unanswered_questions: clarify && !forcedStop ? [clarify.question] : [],
    candidate_next_actions: [action],
    selected_next_action: clarify && !forcedStop ? null : action,
    official_sources: sources,
    escalation_route: route,
    user_consent: prior?.user_consent ?? [],
    loop_count,
    uncertainty_notes: clarify && !forcedStop
      ? ["One answer would change the safe next step."]
      : forcedStop
        ? ["Loop limit reached. Showing the official fallback."]
        : [],
    needs_clarification: Boolean(clarify && !forcedStop),
    redaction_notice: extraction.redaction_notice ?? notice,
  };
}

export function withConsent(state: IncidentState, label: string): IncidentState {
  return {
    ...state,
    user_consent: unique([...state.user_consent, label]),
  };
}

export function handoffSummary(state: IncidentState): string {
  const facts = state.facts_shared.length
    ? state.facts_shared.map((f) => `- ${f}`).join("\n")
    : "- Facts still being collected";
  return [
    "ScamSafe handoff summary (prepared, not sent)",
    `Thread: ${state.thread_id}`,
    `Stage: ${state.current_stage}`,
    `Route: ${state.escalation_route}`,
    "Facts:",
    facts,
    "This is not a police report. Confirm before contacting a bank, 1799, or SPF.",
  ].join("\n");
}
