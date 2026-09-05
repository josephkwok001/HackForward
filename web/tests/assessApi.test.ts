import assert from "node:assert/strict";
import test from "node:test";

import { seedFromRules, toAssessRequest } from "../src/assessApi.ts";
import type { IncidentState } from "../src/types.ts";

function sampleState(over: Partial<IncidentState> = {}): IncidentState {
  return {
    thread_id: "t1",
    raw_evidence_refs: ["paste:1"],
    events_and_timeline: [],
    facts_shared: ["They asked about a transfer, PayNow, or moving money."],
    incident_type: "bank_impersonation",
    uncertainty_notes: [],
    redaction_notice: null,
    current_stage: "active_pressure",
    risk_flags: ["requested_transfer", "impersonating_official"],
    unanswered_questions: ["Have you already transferred any money?"],
    candidate_next_actions: [],
    selected_next_action: null,
    official_sources: [],
    escalation_route: "scamshield_or_1799",
    user_consent: [],
    loop_count: 0,
    needs_clarification: true,
    ...over,
  };
}

test("keyword seed fills Stage / Risk / Why without a network call", () => {
  const seed = seedFromRules(sampleState());
  assert.equal(seed.current_stage, "active_pressure");
  assert.equal(seed.source, "rules");
  assert.ok(seed.decision_factors.length > 0);
  assert.ok(seed.decision_factors.length <= 3);
  assert.equal(seed.memory_turn_count, 0);
});

test("re-assess sends prior stage; first assess does not", () => {
  const first = toAssessRequest(sampleState({ loop_count: 0 }));
  assert.equal(first.current_stage, undefined);
  const again = toAssessRequest(sampleState({ loop_count: 1 }));
  assert.equal(again.current_stage, "active_pressure");
});
