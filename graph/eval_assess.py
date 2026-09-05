#!/usr/bin/env python3
"""Compare keyword rules (and Bedrock when configured) against labelled fixtures."""

from __future__ import annotations

import json
from pathlib import Path

from fallback import haystack_from, rules_assess
from nodes.assess import bedrock_configured, run_assess
from nodes.safety_gate import apply_urgent_gate
from state import AssessInput

FIXTURES = Path(__file__).parent / "fixtures" / "assess_cases.json"


def evaluate() -> int:
    cases = json.loads(FIXTURES.read_text())
    print(f"{'id':<4} {'label':<22} {'expect':<20} {'rules':<20} {'model':<20} flags")
    failures = 0
    for case in cases:
        record = AssessInput.model_validate(case["record"])
        rules = apply_urgent_gate(rules_assess(record), haystack_from(record))
        model_stage = "skipped"
        if bedrock_configured():
            model = apply_urgent_gate(run_assess(record), haystack_from(record))
            model_stage = model.current_stage
        expected = case["expected_stage"]
        urgent = set(case.get("expected_urgent") or [])
        ok_rules = rules.current_stage == expected
        if not ok_rules:
            failures += 1
        missing = urgent - set(rules.risk_flags)
        if missing:
            failures += 1
        mark = "ok" if ok_rules and not missing else "MISS"
        print(
            f"{case['id']:<4} {case['label']:<22} {expected:<20} {rules.current_stage:<20} {model_stage:<20} {mark}"
        )
    print(f"\nrules mismatches: {failures}")
    print("bedrock:", "on" if bedrock_configured() else "off (rules only)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(evaluate())
