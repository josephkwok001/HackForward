import assert from "node:assert/strict";
import test from "node:test";

import { inspectIndicators } from "../src/indicators.ts";

test("matches an exact official domain without opening it", () => {
  const report = inspectIndicators("OCBC asked me to visit https://www.ocbc.com/help.");

  assert.deepEqual(report.claimed_organisations, ["OCBC"]);
  assert.equal(report.links[0]?.hostname, "www.ocbc.com");
  assert.equal(report.links[0]?.status, "official_match");
});

test("does not accept a deceptive official-looking suffix", () => {
  const report = inspectIndicators("OCBC sent https://login.ocbc.com.evil.example.com/verify");

  assert.equal(report.links[0]?.hostname, "login.ocbc.com.evil.example.com");
  assert.equal(report.links[0]?.status, "claimed_org_mismatch");
});

test("marks a claimed organisation domain mismatch", () => {
  const report = inspectIndicators("DBS says to use dbs-secure-login.com immediately");

  assert.equal(report.links[0]?.status, "claimed_org_mismatch");
  assert.match(report.links[0]?.reason ?? "", /does not match/);
});

test("marks unknown and shortened domains as unverified", () => {
  const report = inspectIndicators("Open bit.ly/example or example.xyz/help");

  assert.deepEqual(report.links.map((link) => link.status), ["unverified", "unverified"]);
  assert.match(report.links[0]?.reason ?? "", /hides its final destination/);
});

test("masks phone numbers and does not mistake URL digits for contacts", () => {
  const report = inspectIndicators("Call +65 9123 4567 or open https://example.com/91234567");

  assert.deepEqual(report.masked_phone_numbers, ["•••• 4567"]);
  assert.equal(JSON.stringify(report).includes("9123 4567"), false);
});
