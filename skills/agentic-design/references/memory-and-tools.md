# Memory and tools

## Memory roles

| Kind | What it holds | Where it lives |
|---|---|---|
| Short-term | Current turn and the model context window | Prompt for one node |
| Working / incident memory | Facts, stage, risk, consent, loop count | Checkpointed LangGraph state keyed by `thread_id` |
| Long-term knowledge | Official guidance, not the user’s private history | Curated retrieval corpus |

Treat long-term memory as a retrieval problem first. Persist user data only when it is needed to continue the same incident, with consent and a retention limit.

## What to keep in state

Keep in checkpointed state:

- `thread_id`
- evidence references, not raw screenshots inside every prompt
- observed facts, timeline, stage, and risk flags
- unanswered questions and selected next action
- official source IDs used
- escalation route and user consent
- `loop_count` and uncertainty notes

Do not keep passwords, full card numbers, PINs, OTP values, or unredacted dumps of every retrieved document.

## What to pass into prompts

Pass only:

- the current typed state slice the node needs;
- one or two evidence references;
- small typed tool results.

Keep large images, full transcripts, and source documents in storage. Nodes should ask for references, not the whole file.

## Tool composition

| Style | Rule | Example |
|---|---|---|
| Sequential | Later work depends on an earlier typed result | extract → assess → retrieve |
| Parallel | Lookups are independent; latency is the slowest tool | bank FAQ + ScamShield page, only if both are allowed and needed |
| Conditional | Stage or risk selects the safe branch | `payment_pending` → bank handoff preparation |

Prefer sequential plus conditional routing for the MVP. Parallelise only when both results are necessary and neither has a side effect.

## Tool contract

Every tool needs:

- a precise name and when-to-use description;
- validated parameters;
- a small typed success shape;
- a typed failure/timeout result;
- no hidden side effects.

Allowed MVP tools are lookups and handoff-summary preparation. Disallowed tools include transferring funds, accessing a bank account, sending messages to third parties, or filing a report without an approved integration and explicit user confirmation.

## Resume behaviour

Resume an incident with `thread_id`. Merge new evidence into the existing state; do not start a second memory for the same event. Never mix two incidents in one thread.
