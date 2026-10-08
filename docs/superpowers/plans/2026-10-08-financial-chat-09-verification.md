# Stage 9: Acceptance, Report Preservation and Rollout Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Prove the complete financial chat is accurate, authorized and safe for a PoC demo.
**Architecture:** Independent source/SQL oracles plus real API/DB/browser flows and repeatable
live selected-model probes. Existing report outputs are baselined before any new migration/load.
**Tech Stack:** Existing test runners, disposable Postgres 16, Playwright if absent, and the real selected direct model API.
**Spec:** [Financial chat](../../specs/langgraph-financial-chat.md).
**Global constraints:** [Master](2026-10-08-financial-chat-master.md).
**Dependencies:** All prior stages; baseline report capture must happen before stage 2 applies changes.

## Files and ownership

- Create frontend/e2e/financial-chat.spec.ts and financial-reports-regression.spec.ts.
- Add Playwright config/dependency/script wiring only if absent after rebase; retries zero.
- Create backend/src/financial-chat/financial-chat.live-probe.ts and scoped acceptance tests.
- Create docs/superpowers/plans/financial-chat-acceptance-evidence.md during execution, not a
  success claim now. Record aggregate evidence without committing customer financial rows.
- Modify deployment/ec2/README.md and example config for flag/import/memory/demo guidance;
  test registries/root/frontend/backend scripts and quality gate when new leaves require it.

## Evidence interface

One acceptance report records source checksum/load/mapping versions, permitted user scopes,
golden question/selection, exact expected vs observed values/row identities, named executed tests,
live tool sequence, sanitized provider inspection, failures, timings and feature flag state.
Baseline and new outputs must refer to the same legacy dataset for regression comparison.
No invented passing screenshots or unexplained "all tests green" statement.

## Tasks

### 9A: Establish independent source/report baselines early

- [ ] Before stage 2 migration, capture existing statement rows/totals/hierarchy, monthly/YTD/
      Roll-over, exported workbook values/formulas/outline and report transaction identity sets
      from a fixed authorized snapshot. Compare semantics, not volatile export ZIP timestamps.
- [ ] Independently extract original Actual rows and Budget leaf counts/amounts using Decimal or
      golden SQL authored separately from production parser/predicates. Record source precision/
      rounding policy and counts of unknown/unmapped/rejected rows.
- [ ] After new migration/import repeat existing report/import/export/drill tests against the same
      legacy snapshot; demonstrate unchanged schemas/contracts and financial contents.
- [ ] Compare chat/report only when Plant/time/component/GL, source generation and inclusion rules
      genuinely match. Broader new-source retained rows are an explained difference, not a forced match.
      A same-scope unexplained difference blocks acceptance.
- [ ] Confirm null/non-DUB Budget, partial coverage, repeated GL leaf/parent sums and credit signs
      against independent financial expectations; parser output cannot be its own expected oracle.

### 9B: Exercise complete running application

- [ ] Provision throwaway postgres:16-alpine warehouse :5434 and app :5435 with validated absolute
      targets; migrate and seed disposable authenticated users through approved app/API entry points.
      Browser creates test data through app API where available; financial fixtures load through the
      real stage 3 loader harness because this PoC has no new public upload endpoint.
- [ ] Run real browser cases for explicit DUB month comparison, Apr-Aug trend, April-start FY YTD,
      component and GL grouping, Actual-only Cost Center, missing scope and ambiguous component,
      follow-up "now by GL"/"same for August", clarification completion and unsupported causal question.
- [ ] Cover DUB/non-DUB Budget states, loaded-zero, missing one month, negative/offsetting Actuals,
      known-Plant Unmapped and exclusion of Plant unknown in ordinary results.
- [ ] Open every promised Actual shape (total/Plant/month/GL/component), verify prepared first-page
      bundle existed before final completion, and page beyond 10 rows to the independently expected
      full set/total. Budget is not clickable; page sum is not full total.
- [ ] Revoke Plant access between summary/preparation/page/replay; deny access without returning a
      partial mismatched set. Test cross-user IDs, guessed handles, forbidden lookup, session expiry,
      no-CSRF command, duplicate command, disconnect/resume, cancellation and one-run conflict.
- [ ] Replace source generation while paging; retained pin reads old exact set or unavailable pin
      asks to rerun. Test one-hour expiry with controlled time and actual backend restart for memory loss.
- [ ] Inspect chart/table/tooltips for exact equality and missing gaps; keyboard/light/dark/mobile
      walkthrough and flag-off route/API behavior. No fixed sleeps or Playwright retries.

### 9C: Live model and data-boundary proof

- [ ] Real selected provider with explicitly configured model ID: probe each base question three times
      in a fresh conversation. The mock selector is not acceptance evidence.
- [ ] Pin expected selections for month, range, FY YTD, trend, repeated GL/component, Unmapped,
      missing Budget, ambiguous component and transaction requests. Test follow-ups in separately
      seeded conversations; do not use a prior question to accidentally alter base scope.
- [ ] Inspect sanitized actual request payloads for governed vocabulary only. Use marker fixtures
      to prove server money, rows, transaction lines, handles and raw checkpoints never leave via
      model calls/retries/trace collectors. Never log secrets or full real payload financial data.
- [ ] Record selected scope, tool sequence, exact result equality and response detail readiness.
      Selector/prompt changes repeat existing successful phrasing probes before and after;
      hermetic recorded outputs cannot prove live behavior stayed stable.
- [ ] Record total/model/query/preparation timing and bounded work on large selections. Avoid
      inventing a latency SLA absent a user decision; observed results inform scheduling.

### 9D: Quality gates, runbook and safe enablement

- [ ] Inspect registration and executed named leaves, not exit code alone. Run npm run quality,
      npm run typecheck, npm run structural, npm run test:hermetic and relevant disposable DB/browser
      suites. On PowerShell set PGPORT/WAREHOUSE_PG_PORT to 1 for hermetic startup proof then restore.
- [ ] Never execute gated truncating tests on app :5432 or warehouse :5433. Remove only the explicitly
      created disposable containers after validation; keep live demo DBs and customer source files.
      Stop dev servers before builds; preserve .next artifacts appropriately.
- [ ] Update demo instructions for original workbook CLI load, explicit DUB owner, both independent
      ingestion paths, model configuration, flag, one backend instance and memory loss on restart.
      Retain existing EC2 limitations (mock OTP, HTTP, no production readiness); no new cloud infra.
- [ ] Enable flag only after all required accuracy/security/report proofs pass. Rollback disables
      new entry/feature and keeps additive schema/source evidence; existing reports need no data restore.
      No automatic old Ask removal or destructive migration.
- [ ] Assemble acceptance evidence, unresolved limitations and actual checklist status. Separate
      documentation completed, implementation built, tests passed and owner demo acceptance.
      Finish Forge review/close; follow configured human merge policy. Never use gh pr merge.

## Verification and handoff

### Final acceptance checklist

- [ ] Every spec Behaviour/Rules/Acceptance item has an implementation owner and passing evidence.
- [ ] Every promised clickable Actual has prepared exact matching transaction data or an explicit
      failed state; no fabricated values or unprepared "ready" claim.
- [ ] Clarification/no defaults, authorized follow-ups and permission changes behave correctly.
- [ ] Source counts/money, coverage, zero/null/%/closing Roll-over and chart/table equality proven.
- [ ] Existing report generation/export/drill and imports remain unchanged.
- [ ] Real model meets expected selections repeatedly with no forbidden server-data payload.
- [ ] Resume/restart/expiry/paging/source replacement and rollback behave as documented.
- [ ] Open business/mapping/formula-cache limitations remain visible rather than marked solved.

**Done when:** All required named acceptance checks pass and the reproducible PoC is ready for
owner review/demo, with rollout/rollback documented. This plan does not claim they pass today.
**Review focus:** Self-comparing financial oracle; unregistered/skipped leaf; fresh-vs-follow-up
model probe contamination; destructive tests on live DB; bytewise export comparison noise.
