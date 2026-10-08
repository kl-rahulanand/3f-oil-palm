# Stage 9: Acceptance, Report Preservation and Rollout Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Prove the complete financial chat is accurate, authorized and safe for a PoC demo.
**Architecture:** Independent source/SQL oracles plus real API/DB/browser flows and repeatable
live Claude Sonnet probes. Existing report outputs are baselined before any new migration/load.
**Tech Stack:** Existing test runners, disposable Postgres 16, Playwright if absent, and real Anthropic Claude Sonnet 5.5.
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

Decision 0054 accepts deferred business completeness confirmation. The actual source
import remains independently reconciled but its Actual coverage is unconfirmed. Use
the real workbook to prove faithful loading and unavailable complete-Actual states;
use explicitly synthetic complete-coverage fixtures on disposable databases for exact
numeric/zero/trend/drill acceptance. Never present those fixtures as confirmed client
values. Named live questions prove selection and the coverage-dependent outcome; no
complete-customer-Actual demo is promised until a later confirmed coverage process.

- [ ] Before stage 2 migration, capture existing statement rows/totals/hierarchy, monthly/YTD/
      Roll-over, exported workbook values/formulas/outline and report transaction identity sets
      from a fixed authorized snapshot. Compare semantics, not volatile export ZIP timestamps.
- [ ] Independently extract original Actual rows and Budget leaf counts/amounts using Decimal or
      golden SQL authored separately from production parser/predicates. Record source precision/
      rounding policy and counts of unknown/unmapped/rejected rows.
- [ ] After new migration/import repeat existing report/import/export/drill tests against the same
      legacy snapshot; demonstrate unchanged schemas/contracts and financial contents.
- [ ] Baseline and repeat existing Ask through its real API and UI with a fixed warehouse snapshot
      and vendor-boundary fixture. Preserve its contracts/results without importing its code into
      the new agent. No old selector/schema/prompt is changed by this story.
- [ ] Compare chat/report only when Plant/time/component/GL, source generation and inclusion rules
      genuinely match. Broader new-source retained rows are an explained difference, not a forced match.
      A same-scope unexplained difference blocks acceptance.
- [ ] Confirm null/non-DUB Budget, partial coverage, repeated GL leaf/parent sums and credit signs
      against independent financial expectations; parser output cannot be its own expected oracle.

### 9B: Exercise complete running application

Prove mandatory labelled real-source available-data Actual subtotals, their prepared exact
transactions and cap counting, while complete Actual/ratio/changes remain unavailable.
Use spec's real-workbook D1-D12 expectations. Synthetic fixture harness rejects wrong
host/port and non-synthetic confirmation before writes; every synthetic UI result is labelled.
Exercise invalid/negative/fractional/zero/past-end page and over-limit size, empty page 1,
changed continuation size and refresh/second-tab metadata with spec's typed 400 reasons.

Verify signed monthly monetary deltas and null/Not applicable percentage change for
negative-to-positive, negative-to-negative and zero-prior cases, plus missing periods and
ordinary positive-prior arithmetic. Preserve drill-down; Actual-vs-Budget ratios are unchanged.

Verify Unmapped's null Budget/specific label and Not applicable percentage without allocation.
Traverse prepared 10 rows then continuation pages of pinned 20 rows through the entire
immutable set exactly once, with changed continuation limit rejected. Expire the shared
30-second preparation deadline using controlled time and prove cancellation, preserved
ready scopes, unfinished detail failures and exact summary, not fabricated ready states.

Prove no report permission denies direct endpoints, no Plant grants shows guidance without
data, and revoking report permission blocks replay/stream/prepared cache/pagination.
Include missing Cost Center/Section buckets, exact totals and prepared transaction sets.

- [ ] Provision throwaway postgres:16-alpine warehouse :5434 and app :5435 with validated absolute
      targets; migrate and seed disposable authenticated users through approved app/API entry points.
      Browser creates test data through app API where available; financial fixtures load through the
      real stage 3 loader harness because this PoC has no new public upload endpoint.
- [ ] Run real browser cases for explicit DUB month comparison, Apr-Aug trend, April-start FY YTD,
      component and GL grouping, Actual-only Cost Center, missing scope and ambiguous component,
      follow-up "now by GL"/"same for August", clarification completion and unsupported causal question.
- [ ] Cover DUB/non-DUB Budget states, loaded-zero, missing one month, negative/offsetting Actuals,
      known-Plant Unmapped and exclusion of Plant unknown in ordinary results.
      Include a GL with Actuals but no Budget leaf in a loaded Plant/month: keep the row,
      show null Budget/"No Budget line for this GL" and Not applicable percentage, open its
      prepared transactions and page to the independently reconciled full Actual total.
      Include multiple Budget leaves without GL: "GL not assigned" remains visible, each leaf
      counts once, and grouped Budget reconciles to the complete same-scope total without
      inventing GL codes or Actual mappings.
- [ ] Open every promised Actual shape (total/Plant/month/GL/component), verify prepared first-page
      bundle existed before final completion, and page beyond 10 rows to the independently expected
      full set/total. Budget is not clickable; page sum is not full total.
      Include the component breakdown's Unmapped row: mapped leaves plus Unmapped equal
      Plant Actual, its full contributing transaction set reconciles, and a named-component
      filter does not include unrelated Unmapped lines or allocate Budget.
- [ ] Revoke Plant access between summary/preparation/page/replay; deny access without returning a
      partial mismatched set. Test cross-user IDs, guessed handles, forbidden lookup, session expiry,
      no-CSRF command, duplicate command, disconnect/resume, cancellation and one-run conflict.
- [ ] Replace source generation while paging; retained pin reads old exact set or unavailable pin
      asks to rerun. Test one-hour expiry with controlled time and actual backend restart for memory loss.
- [ ] Inspect chart/table/tooltips for exact equality and missing gaps; keyboard/light/dark/mobile
      walkthrough and flag-off route/API behavior. No fixed sleeps or Playwright retries.
      Prove a no-row Plant/month is zero only with confirmed complete coverage. Without
      coverage, or with partial rows but unconfirmed completeness, show "Actual data not loaded"
      and chart gaps, not a complete zero or total.
- [ ] Toggle the runtime feature flag with the same frontend build and prove that missing new-model
      configuration cannot prevent reports or old Ask from starting or answering.

### 9C: Live model and data-boundary proof

After the final change to any instruction module, tool schema or cache placement, rerun
three fresh D1-D12 probes and isolated follow-ups on that revision. Earlier revision
evidence is invalid. Prove static prefix equality across users with different grants,
without putting vocabulary in tool schemas. Vendor prerequisites still gate real calls.

Record owner confirmation of application API/model access, billing and client retention/
residency requirements before real new-chat Anthropic calls. Until then fake-model/synthetic
development is allowed but this live gate stays pending.
Profile named demo selections against reconciled source and record distinct scopes before
live probes. Prove 200 accepted scopes and 201 narrowing, including parents/totals/empty/
Unmapped/missing buckets and chart/table deduplication. Do not assume source selections fit.

- [ ] Direct Anthropic claude-sonnet-5-5: probe each base question three times
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
- [ ] Extend the same live provider-boundary proof for trusted instruction modules and explicit
      static-only caching: compare cache-on/off selections and exact server results with the same
      source scope, and record actual cache-write/read tokens and timing on repeat requests.
      Verify user/grant/context changes remain outside the cached prefix and current authorization
      still governs reads/delivery. Prove expiry/miss/short-prefix handling without prompt padding;
      an ineligible prefix is an honest no-hit result, not an invented saving. Use sanitized
      metadata only; vendor prerequisites still apply and no new framework is introduced.
- [ ] Record total/model/query/preparation timing and bounded work on large selections. Avoid
      inventing a latency SLA absent a user decision; observed results inform scheduling.

### 9D: Quality gates, runbook and safe enablement

Keep the Claude question/expected-selection set and sanitized correctness/latency/usage report
as the baseline for a later OpenAI comparison. Do not run OpenAI or add its key/adapter to this
initial acceptance gate; later evaluation must use identical source scopes and financial rules.

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
- [ ] Separate real-source unconfirmed/unavailable evidence from synthetic complete-coverage
      numeric proof; record the owner-accepted deferred process without inventing certification.
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
