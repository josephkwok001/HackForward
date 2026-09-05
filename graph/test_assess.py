import json
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app import app
from fallback import haystack_from, rules_assess
from nodes.safety_gate import apply_urgent_gate
from state import AssessInput, TimelineEvent
from workflow import GRAPH, invoke_assess, merge_thread_memory

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

    def test_assess_input_redacts_secrets_before_graph_memory(self) -> None:
        record = AssessInput.model_validate(
            {
                "thread_id": "sanitize-1",
                "facts_shared": ["OTP 123456 was requested"],
                "events_and_timeline": [
                    {
                        "time_hint": "now",
                        "actor": "caller",
                        "observation": "Send the OTP 654321 now",
                    }
                ],
            }
        )
        self.assertNotIn("123456", " ".join(record.facts_shared))
        self.assertNotIn("654321", record.events_and_timeline[0].observation)
        self.assertIn("[redacted code]", record.facts_shared[0])
        self.assertTrue(record.redaction_notice)

    def test_follow_up_reuses_checkpointed_thread_history(self) -> None:
        first = invoke_assess(
            AssessInput(
                thread_id="memory-1",
                incident_type="bank_impersonation",
                events_and_timeline=[
                    TimelineEvent(
                        time_hint="first turn",
                        actor="user",
                        observation="A caller claimed to be from my bank.",
                    )
                ],
            )
        )
        follow_up = invoke_assess(
            AssessInput(
                thread_id="memory-1",
                events_and_timeline=[
                    TimelineEvent(
                        time_hint="follow-up",
                        actor="user",
                        observation="They now asked me to transfer money.",
                    )
                ],
            )
        )
        snapshot = GRAPH.get_state({"configurable": {"thread_id": "memory-1"}})
        saved = snapshot.values["record"]
        self.assertEqual(follow_up.thread_id, "memory-1")
        self.assertEqual(follow_up.memory_turn_count, 2)
        self.assertEqual(len(saved["events_and_timeline"]), 2)
        self.assertEqual(first.memory_turn_count, 1)
        observations = [event["observation"] for event in saved["events_and_timeline"]]
        self.assertTrue(any("from my bank" in item for item in observations))
        self.assertTrue(any("transfer money" in item for item in observations))

    def test_memory_rejects_different_thread_ids(self) -> None:
        first = AssessInput(thread_id="memory-a", facts_shared=["one"])
        other = AssessInput(thread_id="memory-b", facts_shared=["two"])
        with self.assertRaises(ValueError):
            merge_thread_memory(first, other)

    def test_memory_deduplicates_repeated_events(self) -> None:
        event = TimelineEvent(time_hint="now", actor="user", observation="Same line twice.")
        first = AssessInput(thread_id="memory-dedupe", events_and_timeline=[event])
        second = AssessInput(thread_id="memory-dedupe", events_and_timeline=[event])
        merged = merge_thread_memory(first, second)
        self.assertEqual(len(merged.events_and_timeline), 1)

    def test_memory_is_bounded_to_recent_events(self) -> None:
        first = AssessInput(
            thread_id="memory-limit",
            events_and_timeline=[
                TimelineEvent(time_hint=str(i), actor="user", observation=f"Old event {i}")
                for i in range(40)
            ],
        )
        second = AssessInput(
            thread_id="memory-limit",
            events_and_timeline=[TimelineEvent(time_hint="new", actor="user", observation="New event")],
        )
        merged = merge_thread_memory(first, second)
        self.assertEqual(len(merged.events_and_timeline), 40)
        self.assertEqual(merged.events_and_timeline[-1].observation, "New event")

    def test_memory_endpoint_exposes_metadata_without_event_text(self) -> None:
        client = TestClient(app)
        client.post(
            "/assess",
            json={
                "thread_id": "memory-api",
                "events_and_timeline": [
                    {
                        "time_hint": "now",
                        "actor": "user",
                        "observation": "A caller claimed to be from my bank.",
                    }
                ],
            },
        )
        response = client.get("/memory/memory-api")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["thread_id"], "memory-api")
        self.assertEqual(body["memory_turn_count"], 1)
        self.assertNotIn("observation", body)
        dumped = json.dumps(body)
        self.assertNotIn("claimed to be from my bank", dumped)

    def test_memory_endpoint_returns_not_found_for_unknown_thread(self) -> None:
        response = TestClient(app).get("/memory/does-not-exist")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
