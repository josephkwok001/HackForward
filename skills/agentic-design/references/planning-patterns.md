# Planning patterns

Use this note when choosing how ScamSafe should decide the next step. The user should see one next action, not a long internal plan.

## Pattern catalogue

| Pattern | When to use | ScamSafe fit |
|---|---|---|
| Decomposition | The steps are known, stable, and low-risk | Intake and extraction only |
| Reactive | New evidence can change the next move | Re-assessment after a screenshot, answer, or stage change |
| Hierarchical | A coarse plan exists, but each phase must adapt | Default: assess stage, then react inside that stage |

## Hierarchical default

Keep a short internal plan:

1. Establish facts and stage.
2. Close the one uncertainty that would change the route.
3. Retrieve official guidance for that stage.
4. Apply the safety gate.
5. Present one user-confirmed action, or prepare a handoff.

Revise remaining phases when new evidence contradicts the current stage or risk flags. Do not dump the full plan into the UI.

## Decomposition example

Use a fixed sequence only when the environment cannot change mid-flow:

```text
accept evidence -> extract facts -> write typed state
```

Do not decompose “help this person” into a ten-step script. Payment-pending, OTP-shared, and money-already-sent need different routes.

## Reactive example

After each observation, choose one action from state:

```text
state + new evidence
  -> ask one question
  or retrieve one official source
  or show one next-action card
  or prepare a handoff
```

Bound the loop with `loop_count`. Stop and hand off if the loop limit is reached or urgency is high.

## What not to plan

- Do not plan money movement, police filing, or third-party contact as autonomous steps.
- Do not plan a multi-day recovery journey in the MVP.
- Do not add a supervisor and sub-agents unless a phase needs isolated context or a narrower tool allow-list.
