# Incident state

This is the shared contract between the front end, LangGraph nodes, tools, evaluation cases, and demo. Change field names here first, then update every consumer.

## Locked intake contract

The three UI modes feed the same intake record. This slice performs collection and
extraction only; it does not assess, route, or select a next action.

```text
IntakeRequest
  thread_id?          # omit on first submit; reuse when adding evidence
  mode                # message | describe | screenshot
  text?               # pasted transcript or description
  evidence_ref?       # screenshot id/filename; never raw bytes in a prompt

IncidentRecord
  thread_id
  raw_evidence_refs
  events_and_timeline
  facts_shared
  incident_type       # or unknown
  uncertainty_notes
  redaction_notice
```

`IncidentRecord` is an intake-only subset of the full state below. Consumers must
not add assessment, advice, action, source, escalation, or routing fields to the
intake response.

## Required fields

| Field | Purpose |
|---|---|
| `thread_id` | Resume the same incident; never mix two events |
| `raw_evidence_refs` | Pointers to screenshots, pasted text, or uploads |
| `incident_type` | Working label for the scam pattern, or `unknown` |
| `current_stage` | Where the person is in the interaction |
| `risk_flags` | Urgent or policy-relevant signals |
| `events_and_timeline` | Observed events, not model speculation |
| `facts_shared` | Information the person already gave the other party |
| `unanswered_questions` | At most one high-value question when it changes the route |
| `candidate_next_actions` | Options considered internally |
| `selected_next_action` | The single action shown to the user |
| `official_sources` | Allow-listed sources actually used |
| `escalation_route` | `none`, `bank`, `scamshield_or_1799`, `police`, or `trusted_contact` |
| `user_consent` | What the user has confirmed |
| `loop_count` | Re-assessment / tool-iteration counter |
| `uncertainty_notes` | Gaps that a judge or teammate can inspect |

Validate every node update with Pydantic. Nodes return partial updates only.

## Suggested stage enum

```text
suspicious_contact
active_pressure
link_clicked
app_installed
otp_shared
payment_pending
money_sent
repeat_recovery
unknown
```

## Suggested risk flags

```text
requested_transfer
requested_otp
requested_remote_access
impersonating_official
payment_in_progress
funds_already_moved
user_still_on_the_call
insufficient_evidence
```

## Transition rules

- New evidence goes to extract, then assess; do not jump straight to advice.
- `needs_clarification` routes to one question, then back to assess.
- Urgent flags (`otp_shared`, `payment_pending`, `money_sent`, `requested_remote_access`) go through the safety gate before any general education.
- `selected_next_action` is set only after the safety gate.
- External side effects require `user_consent` for that action.
- Increment `loop_count` on every re-assessment or tool retry. Stop at the hard limit and take the safe fallback or handoff.

## What must not live in state

- Passwords, full card numbers, PINs, OTP values
- Raw image bytes inside the prompt path
- Unredacted third-party contact lists
- Hidden chain-of-thought

## Checkpointing

Prototype with `InMemorySaver` and `thread_id`. Durable storage needs an explicit retention, consent, and access-control decision before it is added.
