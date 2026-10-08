# Stage 1: Contracts and Streaming Compatibility Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Pin the shared response/tool seam and prove streaming inside the existing stack.
**Architecture:** Shared validated types isolate domain results from transport frames. A minimal
NestJS-to-React proof chooses compatible packages without copying Agent Server deployment.
**Tech Stack:** TypeScript, Zod, existing CommonJS Node/NestJS and Next/React; pinned LangGraph packages.
**Spec:** [Financial chat](../../specs/langgraph-financial-chat.md).
**Global constraints:** All [master rules/interfaces/limits](2026-10-08-financial-chat-master.md) apply.
**Dependencies:** None; read the original draft and merged branch before choosing versions.

## Files and ownership

- Create contract/src/financial-chat.ts and contract/test/financial-chat.test.ts.
- Modify contract/src/index.ts and contract/package.json to export/register the contract.
- Create backend/src/financial-chat/stream-adapter.ts and stream-adapter.test.ts.
- Create a minimal frontend/src/features/financial-chat/financial-chat.transport.ts proof;
  stage 7 expands this same file instead of creating a second adapter.
- Modify backend/frontend manifests and package-lock.json only for proven dependencies.
- Scope backend/package.json and tools/quality-gate.test.mjs for backend test registration.
- Include .prettierignore if an edited existing file is ignored.

## Interfaces

Produces every canonical type in the master, strict input/output validators, FinancialChatEvent
and the transport mapping consumed by stages 6-8. Define Money as a signed fixed-two-decimal
string; identifiers never become JS numbers. Percentage is a server decimal string or null
with reason; stage 4 owns calculation, stage 8 formatting.

Define component prop unions for FinancialTotal, FinancialComparison, MonthlyTrend and
ClarificationCard; transaction bundles are indexed by opaque drilldownId with ready/error status.
Each UI block references the same query result/scope, not a second independent money object.

## Tasks

### 1A: Pin strict domain contracts

- [ ] Write boundary cases named rejects_unknown_input_fields, preserves_large_signed_money,
      separates_missing_budget_from_zero, validates_partial_coverage, rejects_unknown_ui_component
      and validates_transaction_pagination. Assert no coercion of arbitrary strings/unknown fields.
- [ ] Run the new registered contract leaf before implementation; confirm failures reflect absent
      contract behavior rather than broken harness. Run contract build before downstream checks.
- [ ] Define enums of approved measures/dimensions, typed eq/in/neq dimension filters and approved
      comparisons. Stage 4's catalog narrows combinations; schema never permits SQL/filter code.
- [ ] Define complete confirmed selection versus incomplete pending candidate. Distinguish empty
      Actual dataset, unloaded Actual period, no matches, zero net, absent Budget and detail failure.
- [ ] Pin errors with details.reason, fieldErrors and correlation support. Clarification contains
      missing fields and permission-scoped choices, not a default hidden selection.
- [ ] Define query/drill references, page/full total identity and response/event version. Make a
      final answer complete even if an earlier stream message was missed.
- [ ] Pin proposed master limits or document a justified adjustment before dependent stages.

### 1B: Prove transport compatibility

- [ ] Inspect published and installed package types for the same compatible versions. Prove
      CommonJS loading, Node >=20, React 19, Zod compatibility, cancellation and local UI blocks.
      Do not select versions from memory or import incompatible old/new SDK React APIs together.
- [ ] Pin @langchain/anthropic / ChatAnthropic compatibility for claude-sonnet-5-5. Configure
      provider=anthropic and the explicit model ID with backend-only ANTHROPIC_API_KEY. Prove
      ordinary tool-call/structured selection handling without unsupported forced tool use or
      non-default sampling parameters. Do not install @langchain/openai for the initial PoC.
- [ ] Build a minimal real custom NestJS command/stream flow and render a registered FinancialTotal
      fixture in React; fixture values are explicitly synthetic, never presented as real source data.
- [ ] Pin supported command names, serialization, event order, resume cursor and terminal errors
      in a protocol note. SDK-specific protocol is owned by stream-adapter, not business services.
- [ ] Prove split/chunked frames, duplicate delivery, disconnect/reconnect and unknown event behavior.
      A duplicate terminal/UI event must not duplicate the answer or trigger another warehouse query.
- [ ] Keep /api/v1/financial-conversations/:id namespace and credential-aware fetch integration.
      Do not assume hosted thread/run routes already exist; stage 7 implements actual routes.
- [ ] If compatible custom transport cannot be proven, stop dependent stages with evidence and
      revise this seam; do not silently add Agent Server or upgrade Next/Tailwind wholesale.

## Verification and handoff

- [ ] Run npm -w @3f/contract run test, npm run build:contract, npm run typecheck and focused
      adapter tests; inspect named leaves. Run npm run quality and npm run structural with dev
      servers stopped. Hermetic protocol proof must not require an external model API or a live DB.
- [ ] Record package versions, imports, accepted command/event examples and tested compile/runtime
      paths. Later stages consume these exact names and fixtures.
- [ ] Commit only scoped files on the Forge task branch; no edits to existing report/chat code.

**Done when:** A real local stream crosses the shared schema and renders one approved component,
with exact-money preservation and explicit protocol failures. No feature rollout yet.

**Review focus:** Mixed SDK generations; numeric money coercion; raw unknown UI props; ambiguous
partial coverage; final payload depending on replay of earlier events.
