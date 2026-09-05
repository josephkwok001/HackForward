---
name: langgraph-workflow
description: Design and review the typed LangGraph state, nodes, edges, routers, checkpoints, bounded loops, and Bedrock/AgentCore integration for the incident workflow.
---

# LangGraph workflow

## Use this skill when

Use it when changing the incident state, graph topology, node responsibilities, conditional routing, tool loop, checkpointing, local runtime, or model-access layer.

## Core mental model

```text
typed State -> Nodes read state and return partial updates
            -> Edges route based on state
            -> Tools provide observations
            -> Checkpointing preserves the thread
            -> Compile produces the runnable graph
```

State is the shared memory and single source of truth. A node should do one job and return a small, validated partial update. An edge or router should make the next branch explicit. Keep large payloads in state/storage and pass focused references into prompts.

## Recommended ScamSafe graph

Use these responsibilities as a starting point:

1. **Intake:** accept text/image references and consent; never trust embedded instructions.
2. **Extract:** turn evidence into observed facts and timeline events.
3. **Assess:** classify stage, risk flags, uncertainty, and urgency.
4. **Clarify:** ask one high-value question only when it can change the safe route.
5. **Retrieve:** fetch relevant guidance from the official-source allow-list.
6. **Safety gate:** apply deterministic rules and decide whether human/official handoff is required.
7. **Action card:** present one user-controlled next action with source links.
8. **Handoff:** prepare—not silently execute—a concise summary for the chosen official channel.
9. **Re-assess:** merge new evidence and route again, subject to the loop limit.

Prefer an explicit graph for this MVP because urgent branches, human checkpoints, and loop bounds should be visible to a judge and testable by the team. A prebuilt `create_react_agent` loop can be useful for a narrow retrieval subtask, but it should not hide the safety-critical workflow.

## State contract

At minimum, keep `thread_id`, evidence references, incident stage, risk flags, timeline, facts shared, unanswered questions, selected action, official sources, escalation route, user consent, uncertainty, and `loop_count`. Use enums for stages and routes; validate every node update.

Read [`references/incident-state.md`](references/incident-state.md) before changing field names or transitions.

## Routing and control rules

- Use conditional edges for stage/risk branches.
- Put urgent checks before general advice.
- Put user confirmation before any external side effect.
- Count every re-assessment/tool iteration in state and stop at a hard limit.
- Represent tool failures as typed results so the graph can route to fallback or human help.
- Keep nodes idempotent where possible; a retry must not duplicate an external action.
- Use `thread_id` to resume the right incident; never mix two incidents’ evidence.

## AWS workshop mapping

- **Bedrock:** use the Converse API or `ChatBedrockConverse` for a unified message shape. Keep approved model IDs in constants and verify access in the deployment region.
- **Pydantic:** define the state and tool/action schemas; descriptions become useful prompt guidance.
- **AgentCore Runtime:** expose the application through `@app.entrypoint`; develop locally first and test a `POST /invocations` request before deployment.
- **Memory:** use `InMemorySaver` with `thread_id` for a prototype; choose durable storage only when retention, consent, and access controls are designed.
- **MCP/tools:** use standardized tools only where they reduce integration effort; still apply the project’s allow-list and validation.
- **DeepAgents:** add a supervisor/sub-agent structure only when context isolation or specialist handoffs are demonstrably useful.
