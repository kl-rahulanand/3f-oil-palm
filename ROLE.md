# Codex subagent routing

Use these rules when delegating work to Codex subagents. They apply in any repository and require no additional workflow or skill. The main agent's model and reasoning effort remain the user's or host's choice.

## Choose a model before delegating

| Work | Model | Reasoning |
| --- | --- | --- |
| Routine lookups, inventories, log summaries, and status checks; fallback for routine work | `gpt-5.6-luna` | `medium` |
| Bounded implementation, tests, fixes with a diagnosed cause, document edits, and mechanical refactors | `gpt-5.6-luna` | `max` |
| Read-heavy code exploration, dependency tracing, and checking documentation against code | `gpt-5.6-terra` | `high` |
| Planning, decomposition, architecture, difficult diagnosis, independent review, and final functional judgment | `gpt-5.6-sol` | `high` |

Choose by the judgment required, not by file count. A routine lookup stays Luna medium. Exploration requiring substantial synthesis uses Terra high. Writing a well-scoped change uses Luna max. Resolving an unclear contract or root cause, making architectural decisions, or judging correctness independently uses Sol high. Split mixed work only when the pieces can be completed independently; otherwise use the model required for its hardest essential decision.

Never select Luna low. Explicit user instructions and required project specialist configurations take precedence over this table.

## Delegate a bounded outcome

Before spawning a child, specify its outcome, relevant evidence, ownership or write scope, constraints, and completion checks. For code changes, tell the child that others may be working in the repository and that it must preserve their edits. Request a concise result with changed files, checks, and unresolved issues.

Select the model and reasoning effort explicitly through the host's supported delegation mechanism. Use an existing configured role when it provides the required settings. Some hosts pin specialist models or restrict overrides when inheriting conversation history: use a supported configuration or fresh child where available. If the requested selection is unavailable, report the limitation; do not claim that routing was applied.

## Control cost and escalation

Delegate when independent work justifies another agent. Give each child the relevant context and contracts, avoiding unrelated history. Reuse its completed work, use deterministic commands for mechanical checks, and avoid overlapping investigations or duplicate reviews.

If a child exposes an unresolved root cause, conflicting requirements, or a decision beyond its scope, send the evidence and remaining question to Sol high. Do not automatically retry through Luna, Terra, and Sol, or restart the same failed prompt without new evidence. Keep required independent review separate from implementation.

## Optional runtime fallback

This document guides the coordinator's choices; it does not change Codex settings. On hosts supporting these options, merge the following keys into the existing `[agents]` table in `.codex/config.toml`, preserving other settings:

```toml
[agents]
default_subagent_model = "gpt-5.6-luna"
default_subagent_reasoning_effort = "medium"
```

The fallback does not classify tasks. Explicit spawn settings and configured specialist roles can select other models. Check the host's reported child configuration when available before claiming a model was used.

Configuration reference: [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
