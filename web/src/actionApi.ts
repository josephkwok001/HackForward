import { actionFor } from "./sources.ts";
import type { ActionPlanRequest, ActionPlanResult, EscalationRoute, RiskFlag, Stage, StageAssessResult } from "./types.ts";

export function routeFor(stage: Stage, flags: RiskFlag[]): EscalationRoute {
  if (stage === "money_sent") return "police";
  if (stage === "payment_pending" || stage === "otp_shared" || flags.includes("payment_in_progress")) {
    return "bank";
  }
  return "scamshield_or_1799";
}

export function seedAction(assessment: StageAssessResult): ActionPlanResult {
  const route = routeFor(assessment.current_stage, assessment.risk_flags);
  const { action, sources } = actionFor(assessment.current_stage, route);
  return {
    thread_id: assessment.thread_id,
    current_stage: assessment.current_stage,
    selected_next_action: action,
    escalation_route: route,
    official_sources: sources,
    decision_factors: [`Official playbook for ${assessment.current_stage.replace(/_/g, " ")}.`],
    retrieval_failed: false,
    source: "playbook",
  };
}

export function toActionRequest(assessment: StageAssessResult): ActionPlanRequest {
  return {
    thread_id: assessment.thread_id,
    current_stage: assessment.current_stage,
    risk_flags: assessment.risk_flags,
  };
}

export async function fetchAction(request: ActionPlanRequest): Promise<ActionPlanResult> {
  const response = await fetch("/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Action failed (${response.status})`);
  }
  return (await response.json()) as ActionPlanResult;
}