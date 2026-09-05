import assert from "node:assert/strict";
import test from "node:test";

import { extractIncident, validateIntakeRequest } from "../src/intake.ts";

test("extracts a bank impersonation incident without advice fields", () => {
  const record = extractIncident({
    mode: "message",
    text: "OCBC fraud department says I must PayNow my balance to a safe account immediately.",
  });

  assert.equal(record.incident_type, "bank_impersonation");
  assert.ok(record.facts_shared.some((fact) => fact.includes("bank")));
  assert.ok(record.facts_shared.some((fact) => fact.includes("transfer")));
  assert.equal("selected_next_action" in record, false);
  assert.equal("current_stage" in record, false);
});

test("redacts OTP, card number, and password before storing the record", () => {
  const otp = "123456";
  const card = "4111 1111 1111 1111";
  const password = "hunter2";
  const record = extractIncident({
    mode: "message",
    text: `They asked for code ${otp}, card ${card}, password: ${password}`,
  });
  const stored = JSON.stringify(record);

  assert.equal(stored.includes(otp), false);
  assert.equal(stored.includes(card), false);
  assert.equal(stored.includes(password), false);
  assert.match(record.redaction_notice ?? "", /Sensitive data was removed/);
});

test("keeps a vague description unknown and records uncertainty", () => {
  const record = extractIncident({
    mode: "describe",
    text: "Something odd happened earlier and I am not sure what it was.",
  });

  assert.equal(record.incident_type, "unknown");
  assert.ok(record.uncertainty_notes.length > 0);
});

test("a screenshot-only request stores a reference without inventing a transcript", () => {
  const record = extractIncident({
    mode: "screenshot",
    evidence_ref: "upload/screenshot-001.png",
  });

  assert.deepEqual(record.raw_evidence_refs, ["upload/screenshot-001.png"]);
  assert.ok(record.uncertainty_notes.some((note) => note.includes("what they asked")));
  assert.ok(record.events_and_timeline[0]?.observation.includes("no transcript was inferred"));
});

test("additional evidence reuses a thread while new incidents do not collide", () => {
  const first = extractIncident({ mode: "describe", text: "A caller mentioned my bank." });
  const second = extractIncident(
    { thread_id: first.thread_id, mode: "message", text: "They then asked for PayNow." },
    first,
  );
  const separate = extractIncident({ mode: "describe", text: "A different caller contacted me." });

  assert.equal(second.thread_id, first.thread_id);
  assert.notEqual(separate.thread_id, first.thread_id);
  assert.ok(second.events_and_timeline.length > first.events_and_timeline.length);
});

test("validates required evidence and rejects raw image data", () => {
  assert.equal(
    validateIntakeRequest({ mode: "message" }),
    "At least one of text or evidence_ref is required.",
  );
  assert.equal(
    validateIntakeRequest({ mode: "screenshot", evidence_ref: "data:image/png;base64,abc" }),
    "evidence_ref must be an id or filename, not raw image data.",
  );
});
