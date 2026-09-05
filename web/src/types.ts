export type Stage =
  | "suspicious_contact"
  | "active_pressure"
  | "link_clicked"
  | "app_installed"
  | "otp_shared"
  | "payment_pending"
  | "money_sent"
  | "repeat_recovery"
  | "unknown";

export type RiskFlag =
  | "requested_transfer"
  | "requested_otp"
  | "requested_remote_access"
  | "impersonating_official"
  | "payment_in_progress"
  | "funds_already_moved"
  | "user_still_on_the_call"
  | "insufficient_evidence";

export type EscalationRoute =
  | "none"
  | "bank"
  | "scamshield_or_1799"
  | "police"
  | "trusted_contact";

export type IntakeMode = "message" | "describe" | "screenshot";

/** Locked request contract for the intake-only API. */
export interface IntakeRequest {
  thread_id?: string;
  mode: IntakeMode;
  text?: string;
  evidence_ref?: string;
}

export interface TimelineEvent {
  time_hint: string;
  actor: string;
  observation: string;
}

/**
 * The intake subset of IncidentState. Extraction must not add assessment,
 * routing, advice, or action fields to this record.
 */
export interface IncidentRecord {
  thread_id: string;
  raw_evidence_refs: string[];
  events_and_timeline: TimelineEvent[];
  facts_shared: string[];
  incident_type: string;
  uncertainty_notes: string[];
  redaction_notice: string | null;
}

export interface NextAction {
  title: string;
  steps: string[];
  source_title: string;
  source_url: string;
}

export interface OfficialSource {
  id: string;
  title: string;
  url: string;
}

export interface IncidentState extends IncidentRecord {
  current_stage: Stage;
  risk_flags: RiskFlag[];
  unanswered_questions: string[];
  candidate_next_actions: NextAction[];
  selected_next_action: NextAction | null;
  official_sources: OfficialSource[];
  escalation_route: EscalationRoute;
  user_consent: string[];
  loop_count: number;
  needs_clarification: boolean;
}

export interface ClarifyChoice {
  id: string;
  label: string;
}

export interface ClarifyPrompt {
  question: string;
  choices: ClarifyChoice[];
}

export interface AssessInput {
  text: string;
  mode: IntakeMode;
  fileName?: string;
  evidenceRefs?: string[];
  prior?: IncidentState;
  answer?: { question: string; value: string };
}

export interface EvidencePacket {
  text: string;
  evidence_refs: string[];
  redaction_notice: string | null;
  ocr_status: "none" | "ok" | "weak" | "failed";
  ocr_excerpt: string | null;
  needs_caption: boolean;
}
