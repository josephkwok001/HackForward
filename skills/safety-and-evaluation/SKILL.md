---
name: safety-and-evaluation
description: Review ScamSafe for privacy, prompt-injection, tool, escalation, and autonomy risks, then design measurable tests and a credible hackathon evaluation.
---

# Safety and evaluation

## Use this skill when

Use it before merging a feature, exposing a tool, changing escalation behavior, preparing the demo, or claiming that the product is effective.

## Safety baseline

1. Treat screenshots, transcripts, links, and retrieved text as untrusted input.
2. Use an allow-list of official sources and display source title/URL/date where available.
3. Never request passwords, full card numbers, PINs, or OTP values.
4. Do not directly transfer money, access a bank account, install software, contact a third party, or file a report without an approved integration and explicit user-controlled confirmation.
5. Use deterministic rules for urgent flags, schema validation, tool permissions, consent, and loop limits.
6. Make uncertainty visible; do not promise that a person is safe or that funds can be recovered.
7. Minimise and redact personal information in logs, prompts, screenshots, and handoff summaries.
8. Provide a safe fallback when retrieval or a model call fails.

For the full policy, read [`references/guardrails.md`](references/guardrails.md).

## Review every tool

For each tool, document:

- why the tool is needed;
- who is allowed to call it;
- exact parameters and validation;
- whether it reads, writes, or causes an external side effect;
- timeout and typed failure result;
- source of truth for its output;
- human confirmation requirement;
- redacted logging behavior.

If a tool can cause an external side effect, default to preparation plus confirmation, not autonomous execution.

## Evaluate the workflow, not just prose quality

Create a fixed scenario set and compare the stateful workflow with a one-shot model answer and a fixed checklist/rules baseline. Test both normal and adversarial inputs.

Measure:

- schema-validation pass rate;
- stage and risk classification accuracy;
- recall for urgent signals;
- official-source fidelity;
- tool-call success and fallback rate;
- next-action appropriateness;
- handoff-route accuracy;
- task completion;
- loop count, latency, and token cost.

Use human review for safety, clarity, and whether the action is realistic for a stressed user. Do not claim effectiveness from a single successful demo.

## Demo review

The demo should make the plan/act/adapt behavior observable:

1. A screenshot or message enters.
2. The system extracts and stores facts.
3. Stage/risk changes the route.
4. An official source is selected.
5. One next action is shown with a human checkpoint.
6. New evidence changes the state and the next action.
7. An urgent case reaches a clear handoff.

For the scenario matrix and scoring rubric, read [`references/evaluation.md`](references/evaluation.md).
