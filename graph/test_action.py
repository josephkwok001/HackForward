import unittest

from fastapi.testclient import TestClient

from app import app
from sources import ALLOWED_URLS
from state import ActionInput
from workflow import invoke_action


class ActionTests(unittest.TestCase):
    def test_active_pressure_orders_hangup_then_1799(self) -> None:
        result = invoke_action(
            ActionInput(thread_id="a1", current_stage="active_pressure", risk_flags=["requested_transfer"])
        )
        steps = result.selected_next_action.steps
        self.assertEqual(result.escalation_route, "scamshield_or_1799")
        self.assertIn("Hang up", steps[0])
        self.assertIn("1799", steps[1])
        self.assertIn(result.selected_next_action.source_url, ALLOWED_URLS)

    def test_otp_shared_stops_then_bank(self) -> None:
        result = invoke_action(ActionInput(thread_id="a2", current_stage="otp_shared", risk_flags=["requested_otp"]))
        self.assertEqual(result.escalation_route, "bank")
        self.assertIn("Do not send more money", result.selected_next_action.steps[0])
        self.assertIn("bank", result.selected_next_action.steps[1].lower())
        self.assertIn(result.selected_next_action.source_url, ALLOWED_URLS)

    def test_money_sent_uses_bank_then_1799_then_spf(self) -> None:
        result = invoke_action(
            ActionInput(thread_id="a3", current_stage="money_sent", risk_flags=["funds_already_moved"])
        )
        self.assertEqual(result.escalation_route, "police")
        self.assertEqual(len(result.selected_next_action.steps), 3)
        self.assertIn("bank", result.selected_next_action.steps[0].lower())
        self.assertIn("1799", result.selected_next_action.steps[1])
        self.assertIn("police", result.selected_next_action.steps[2].lower())
        self.assertTrue(all(item.url in ALLOWED_URLS for item in result.official_sources))

    def test_action_endpoint(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/action",
            json={"thread_id": "api-action", "current_stage": "active_pressure", "risk_flags": []},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["source"], "playbook")
        self.assertLessEqual(len(body["selected_next_action"]["steps"]), 3)
        self.assertIn("scamshield.gov.sg", body["selected_next_action"]["source_url"])


if __name__ == "__main__":
    unittest.main()
