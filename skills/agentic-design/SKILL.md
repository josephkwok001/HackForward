---
name: agentic-design
description: Decide when this project needs generative AI, an AI agent, or a larger agentic workflow, and design justified planning, tools, memory, and delegation.
---

# Agentic design

## Use this skill when

Use it when adding a capability, deciding whether it is genuinely agentic, choosing a planning style, composing tools, introducing memory, or considering DeepAgents/sub-agents.

## The three levels

| Level | Flow | Meaning |
|---|---|---|
| Generative AI | Input -> output | The model produces an answer, summary, classification, or draft. |
| AI agent | Input -> tool -> output | The model can select and use a tool, then incorporate its result. |
| Agentic AI | Goal -> plan -> agents/tools -> result | Software manages a multi-step workflow with state, routing, adaptation, and control. |

The model is not the whole agent. The surrounding software supplies the tools, state/memory, planning, execution, observation, safety boundaries, and stopping conditions.

## Decide whether a feature is agentic

Ask these questions in order:

1. Is a one-shot answer enough? If yes, start with generative AI.
2. Must the model choose among tools or approved sources? If yes, it may be an agent.
3. Does the task span multiple dependent steps?
4. Can new evidence change the remaining work?
5. Does the workflow need persistent state, a human checkpoint, or a bounded loop?

Only call the capability agentic when the last three questions matter. Do not add sub-agents merely to make a diagram look sophisticated.

## Planning choices

- **Decomposition:** make a full sequence before acting. Useful when the steps are known and low-risk.
- **Reactive:** choose one action from the current state, observe the result, then choose again. Useful when the environment changes.
- **Hierarchical:** make a coarse plan, execute each phase reactively, and revise the remaining phases when evidence contradicts the plan. This is the default fit for the scam-response product.

For ScamSafe, the workflow should not produce a long plan for the user. It should internally manage the incident state and present one clear next action at a time.

For detailed planning examples, read [`references/planning-patterns.md`](references/planning-patterns.md).

## Tool composition

- **Sequential:** use when a later step depends on an earlier result, such as extract -> assess -> retrieve guidance.
- **Parallel:** use only for independent lookups; the slowest tool determines the latency.
- **Conditional:** use when stage or risk determines which branch is safe, such as payment-pending -> bank handoff.

Every tool must have a precise name, purpose, parameters, return shape, timeout, and failure result. Its description is part of the prompt because the model uses it to decide whether and how to call the tool.

## Memory and context

- Short-term memory is the current conversation/context window.
- Long-term memory is external state and retrieval; it is a retrieval problem before it is a storage problem.
- Keep large screenshots, transcripts, and source documents in state or storage. Pass only the relevant facts, references, and small typed results into prompts.
- Persist only what the product needs, with consent and retention limits.

For memory design and tool composition, read [`references/memory-and-tools.md`](references/memory-and-tools.md).

## DeepAgents and sub-agents

A DeepAgent-style supervisor can act as a project manager: create a plan, delegate a narrow task to a sub-agent, inspect the result, and revise the remaining work. Use this only when context isolation or genuinely different specialist capabilities improve safety or quality.

For the MVP, prefer a small number of focused stages—intake, assessment, guidance retrieval, safety gate, and handoff—over a large team of loosely defined agents. Each sub-agent should have a narrow prompt, a narrow tool allow-list, and a typed handoff.
