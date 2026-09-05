import { FLAG_LABEL, STAGE_LABEL } from "./sources.ts";
import type { IncidentState, StageAssessRequest, StageAssessResult } from "./types.ts";

export function seedFromRules(state: IncidentState): StageAssessResult {
  const factors = [`Rules baseline classified this as ${STAGE_LABEL[state.current_stage]}.`];
  if (state.risk_flags.length) {
    factors.push(
      "Keyword signals: " + state.risk_flags.slice(0, 3).map((flag) => FLAG_LABEL[flag]).join(", ") + ".",
    );
  }
  return {
    thread_id: state.thread_id,
    current_stage: state.current_stage,
    risk_flags: state.risk_flags,
    needs_clarification: state.needs_clarification,
    unanswered_questions: state.unanswered_questions.slice(0, 1),
    decision_factors: factors.slice(0, 3),
    uncertainty_notes: state.uncertainty_notes,
    source: "rules",
    loop_count: state.loop_count,
  };
}

export function toAssessRequest(state: IncidentState): StageAssessRequest {
  return {
    thread_id: state.thread_id,
    facts_shared: state.facts_shared,
    events_and_timeline: state.events_and_timeline,
    incident_type: state.incident_type,
    loop_count: state.loop_count,
    ...(state.loop_count > 0 ? { current_stage: state.current_stage } : {}),
  };
}

export async function fetchAssess(request: StageAssessRequest): Promise<StageAssessResult> {
  const response = await fetch("/assess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Assess failed (${response.status})`);
  }
  return (await response.json()) as StageAssessResult;
}