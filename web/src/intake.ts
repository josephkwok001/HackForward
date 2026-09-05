import { redactSensitive as redactEvidence } from "./evidence.ts";
import type { IncidentRecord, IntakeRequest } from "./types.ts";

const BANK = /\b(ocbc|dbs|uob|posb|bank|fraud department)\b/i;
const OFFICIAL =
  /\b(iras|ica|spf|police|singpass|mom\b|cpf|imda|customs|immigration|government|agency|official)\b/i;
const TRANSFER =
  /\b(paynow|pay now|transfer|safe account|hot funds|move (?:your )?money|wire|send (?:the )?money|remaining balance)\b/i;
const OTP = /\b(otp|one[ -]?time password|sms code|verification code|6[ -]?digit)\b/i;
const REMOTE = /\b(anydesk|teamviewer|ultraviewer|remote access|screen ?share|install (?:this|the) app)\b/i;
const LINK = /\b(click (?:this|the) link|https?:\/\/|bit\.ly|tinyurl)\b/i;
const PRESSURE =
  /\b(do not hang up|stay on the line|don'?t tell anyone|do not inform|act now|immediately|within \d+ minutes|reply yes)\b/i;
const SENT = /\b(already (?:transferred|sent|paid)|i (?:sent|paid|transferred)|went through|money (?:has )?(?:left|gone))\b/i;
const PENDING = /\b(about to (?:transfer|pay|send)|i started|transferring now|pending|i'?m about to)\b/i;

const VALID_MODES = new Set<IntakeRequest["mode"]>(["message", "describe", "screenshot"]);

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function evidenceId(kind: "text" | "thread"): string {
  return `${kind}_${globalThis.crypto.randomUUID()}`;
}

export function newIntakeThreadId(): string {
  return evidenceId("thread");
}

export function redactSensitive(text: string): { text: string; notice: string | null } {
  const result = redactEvidence(text);
  if (!result.notice) return result;
  return {
    text: result.text,
    notice: `Sensitive data was removed before intake. ${result.notice}`,
  };
}

export function validateIntakeRequest(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Request body must be a JSON object.";
  }

  const request = value as Record<string, unknown>;
  if (typeof request.mode !== "string" || !VALID_MODES.has(request.mode as IntakeRequest["mode"])) {
    return "mode must be message, describe, or screenshot.";
  }
  if (request.thread_id !== undefined && (typeof request.thread_id !== "string" || !request.thread_id.trim())) {
    return "thread_id must be a non-empty string when provided.";
  }
  if (request.text !== undefined && typeof request.text !== "string") {
    return "text must be a string when provided.";
  }
  if (request.evidence_ref !== undefined && typeof request.evidence_ref !== "string") {
    return "evidence_ref must be a string when provided.";
  }

  const text = typeof request.text === "string" ? request.text.trim() : "";
  const evidenceRef = typeof request.evidence_ref === "string" ? request.evidence_ref.trim() : "";
  if (!text && !evidenceRef) return "At least one of text or evidence_ref is required.";
  if (text.length > 20_000) return "text must be 20,000 characters or fewer.";
  if (evidenceRef.length > 500) return "evidence_ref must be 500 characters or fewer.";
  if (/^(?:data:|blob:)/i.test(evidenceRef) || evidenceRef.length > 500) {
    return "evidence_ref must be an id or filename, not raw image data.";
  }

  return null;
}

function extractedFacts(text: string, evidenceRef?: string): string[] {
  const facts: string[] = [];
  if (BANK.test(text)) facts.push("Named or impersonated a bank (for example a fraud desk).");
  else if (OFFICIAL.test(text)) facts.push("Claimed to be an official organisation or agency.");
  if (TRANSFER.test(text)) facts.push("Asked you to transfer money or use PayNow.");
  if (PRESSURE.test(text)) facts.push("Pressed you to stay on the line or not tell anyone.");
  if (OTP.test(text)) facts.push("Asked about an OTP or verification code.");
  if (REMOTE.test(text)) facts.push("Asked for remote access or screen sharing.");
  if (LINK.test(text)) facts.push("Sent a link to open.");
  if (SENT.test(text)) facts.push("You may already have sent money.");
  if (PENDING.test(text)) facts.push("A transfer may be in progress.");
  if (evidenceRef) facts.push("A screenshot was attached.");
  return facts;
}

function classifyIncident(text: string): string {
  if (BANK.test(text) && (OFFICIAL.test(text) || TRANSFER.test(text) || OTP.test(text))) {
    return "bank_impersonation";
  }
  if (REMOTE.test(text)) return "remote_access";
  if (TRANSFER.test(text)) return "payment_request";
  if (OFFICIAL.test(text)) return "impersonation";
  return "unknown";
}

export function extractIncident(
  request: IntakeRequest,
  prior?: IncidentRecord,
): IncidentRecord {
  const validationError = validateIntakeRequest(request);
  if (validationError) throw new TypeError(validationError);
  if (prior && request.thread_id && prior.thread_id !== request.thread_id) {
    throw new TypeError("The prior record does not match thread_id.");
  }

  const { text, notice } = redactSensitive(request.text?.trim() ?? "");
  const threadId = request.thread_id ?? prior?.thread_id ?? newIntakeThreadId();
  const newRefs: string[] = [];
  if (text) newRefs.push(`${request.mode}:${evidenceId("text")}`);
  if (request.evidence_ref?.trim()) newRefs.push(request.evidence_ref.trim());

  const events = [...(prior?.events_and_timeline ?? [])];
  if (text) {
    events.push({
      time_hint: "submitted",
      actor: "user",
      observation: text.slice(0, 400),
    });
  }
  if (request.evidence_ref?.trim()) {
    events.push({
      time_hint: "submitted",
      actor: "user",
      observation: "Provided a screenshot or file reference; no transcript was inferred from it.",
    });
  }

  const facts = extractedFacts(text, request.evidence_ref);
  const combinedText = [
    ...(prior?.events_and_timeline.map((event) => event.observation) ?? []),
    ...facts,
    text,
  ].join("\n");
  const incidentType = classifyIncident(combinedText);
  const uncertainty: string[] = [];
  if (request.evidence_ref && !text) uncertainty.push("Need what they asked you to do.");
  if (incidentType === "unknown") {
    uncertainty.push("The evidence does not yet identify a clear incident type.");
  }

  return {
    thread_id: threadId,
    raw_evidence_refs: unique([...(prior?.raw_evidence_refs ?? []), ...newRefs]).slice(-20),
    events_and_timeline: events.slice(-20),
    facts_shared: unique([...(prior?.facts_shared ?? []), ...facts]).slice(-20),
    incident_type: incidentType,
    uncertainty_notes: unique([...(prior?.uncertainty_notes ?? []), ...uncertainty]),
    redaction_notice: notice ?? prior?.redaction_notice ?? null,
  };
}
