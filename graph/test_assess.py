import json
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app import app
from fallback import haystack_from, rules_assess
from nodes.safety_gate import apply_urgent_gate
from state import AssessInput
from workflow import invoke_assess

FIXTURES = Path(__file__).parent / "fixtures" / "assess_cases.json"


class AssessTests(unittest.TestCase):
    def test_fixtures_match_rules_plus_gate(self) -> None:
        cases = json.loads(FIXTURES.read_text())
        self.assertGreaterEqual(len(cases), 6)
        for case in cases:
            record = AssessInput.model_validate(case["record"])
            result = apply_urgent_gate(rules_assess(record), haystack_from(record))
            self.assertEqual(result.current_stage, case["expected_stage"], case["id"])
            for flag in case.get("expected_urgent") or []:
                self.assertIn(flag, result.risk_flags, f"{case['id']} missing {flag}")

    def test_graph_returns_same_fields_without_bedrock(self) -> None:
        record = AssessInput(
            thread_id="t1",
            incident_type="bank_impersonation",
            facts_shared=["They asked about a transfer, PayNow, or moving money."],
            events_and_timeline=[],
        )
        result = invoke_assess(record)
        self.assertEqual(result.thread_id, "t1")
        self.assertIn(result.source, ("rules", "bedrock"))
        self.assertTrue(result.current_stage)
        self.assertLessEqual(len(result.decision_factors), 3)
        self.assertLessEqual(len(result.unanswered_questions), 1)

    def test_safety_gate_raises_money_sent(self) -> None:
        record = AssessInput(
            thread_id="t2",
            facts_shared=["The user indicated money may already have been sent."],
            events_and_timeline=[
                {
                    "time_hint": "now",
                    "actor": "user",
                    "observation": "I already transferred the money, it went through.",
                }
            ],
        )
        result = apply_urgent_gate(rules_assess(record), haystack_from(record))
        self.assertEqual(result.current_stage, "money_sent")
        self.assertIn("funds_already_moved", result.risk_flags)

    def test_assess_endpoint_ignores_extra_intake_fields(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/assess",
            json={
                "thread_id": "api1",
                "incident_type": "bank_impersonation",
                "facts_shared": ["They asked about a transfer, PayNow, or moving money."],
                "events_and_timeline": [
                    {
                        "time_hint": "now",
                        "actor": "user",
                        "observation": "OCBC Fraud Department: stay on the line and PayNow. Reply YES.",
                    }
                ],
                "raw_evidence_refs": ["paste:1"],
                "redaction_notice": None,
                "uncertainty_notes": [],
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["thread_id"], "api1")
        self.assertEqual(body["current_stage"], "active_pressure")
        self.assertIn("requested_transfer", body["risk_flags"])
        self.assertLessEqual(len(body["decision_factors"]), 3)
        self.assertLessEqual(len(body["unanswered_questions"]), 1)

    def test_health(self) -> None:
        client = TestClient(app)
        self.assertEqual(client.get("/health").json()["status"], "ok")


if __name__ == "__main__":
    unittest.main()
