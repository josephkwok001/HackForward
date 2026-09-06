import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOcrText, prepareEvidence, redactSensitive } from "../src/evidence.ts";

test("OCR cleanup still lets extract see PayNow and OCBC", () => {
  const cleaned = normalizeOcrText("0CBC Fraud Departmen1: Pay N0w the remaining balance. Call 1789.");
  assert.match(cleaned, /OCBC/);
  assert.match(cleaned, /PayNow/);
  assert.match(cleaned, /1799/);
  assert.match(cleaned, /Fraud Department/);
});

test("prepareEvidence without an image keeps pasted text", async () => {
  const packet = await prepareEvidence({
    mode: "message",
    text: "OCBC asked me to PayNow the remaining balance.",
  });
  assert.equal(packet.ocr_status, "none");
  assert.match(packet.text, /PayNow/);
  assert.equal(packet.needs_caption, false);
});

test("redactSensitive still strips OTP digits", () => {
  const { text, notice } = redactSensitive("They asked for code 445566");
  assert.equal(text.includes("445566"), false);
  assert.match(notice ?? "", /6-digit code/);
});
