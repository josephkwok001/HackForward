import assert from "node:assert/strict";
import test from "node:test";

import { routeFor, seedAction } from "../src/actionApi.ts";
import type { StageAssessResult } from "../src/types.ts";

function sampleAssess(over: Partial<StageAssessResult> = {}): StageAssessResult {
  return {
    thread_id: "t1",
    current_stage: "active_pressure",
    risk_flags: ["requested_transfer"],
    needs_clarification: false,
    unanswered_questions: [],
    decision_factors: [],
    uncertainty_notes: [],
    source: "rules",
    loop_count: 1,
    memory_turn_count: 1,
    ...over,
  };
}

test("active pressure playbook hangs up before 1799", () => {
  const plan = seedAction(sampleAssess());
  assert.equal(plan.source, "playbook");
  assert.match(plan.selected_next_action.steps[0], /Hang up/);
  assert.match(plan.selected_next_action.steps[1], /1799/);
  assert.match(plan.selected_next_action.source_url, /scamshield\.gov\.sg/);
});

test("otp_shared routes to the bank pack", () => {
  assert.equal(routeFor("otp_shared", ["requested_otp"]), "bank");
  const plan = seedAction(sampleAssess({ current_stage: "otp_shared", risk_flags: ["requested_otp"] }));
  assert.match(plan.selected_next_action.steps[0], /Do not send more money/);
});

test("money_sent uses the police route and an official URL", () => {
  assert.equal(routeFor("money_sent", ["funds_already_moved"]), "police");
  const plan = seedAction(sampleAssess({ current_stage: "money_sent", risk_flags: ["funds_already_moved"] }));
  assert.equal(plan.selected_next_action.steps.length, 3);
  assert.match(plan.selected_next_action.source_url, /^https:\/\/www\.(scamshield|police)\.gov\.sg/);
});
