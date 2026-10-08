# Stage 5: Prepared Actual Drill-Down Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Every clickable Actual identifies its exact transactions with a prepared first page.
**Architecture:** Server-owned opaque handles pin owner, result/cell, source generation and the
shared Actual predicate. One transactions tool serves preparation and subsequent pages.
**Tech Stack:** NestJS financial-data service, Postgres, in-memory handle scope and exact money.
**Spec:** [Financial chat](../../specs/langgraph-financial-chat.md).
**Global constraints:** [Master](2026-10-08-financial-chat-master.md).
**Dependencies:** Stage 4 result and shared predicate; stage 1 page/error types.

## Files and ownership

- Create backend/src/financial-data/actual-transactions.repository.ts,
  actual-drill-context.service.ts and actual-drill.db.test.ts.
- Extend financial-data.service.ts and financial-query.repository.ts to issue drill references.
- Extend only the production financial-predicate.ts shared seam where required.
- Register tests in backend/package.json, proof routing and tools/quality-gate.test.mjs.

## Interfaces and identities

query produces per-cell/total drilldownId only for Actual. Store owner, result association,
cell identity, resolved dates/Plants/filters, mapping version, source batches,
expected matchingActualTotal, issued/last-used timestamps and expiry. Never accept client SQL
or selection JSON to widen a handle.
transactions(userId, drilldownId, page, limit): Promise<ActualTransactionPage> reads that scope.
Stage 6 calls it with page 1/limit 10 while forming the answer. Identical scope handles/pages
may be deduplicated within a response without merging distinct source generations.

The data service does not take a conversation ID. Stage 6 binds each returned result/handle
to its owner conversation in graph state; stage 7 verifies that membership before paging.
Do not add a hidden conversation parameter to the shared service signature.

Return transaction number, line ID, posting date/month, Plant, Cost Center, GL code/name,
Debit, Credit, Actual, memo and reference. Nullable dimensions remain identifiable as Unmapped
or unknown where authorized; transaction identifiers stay strings.

## Tasks

### 5A: Issue exact owner-bound scopes

- [ ] Write cases plant_month_gl_component_and_total_reconcile, same_gl_distinct_components,
      negative_and_zero_net_line_sets and total_includes_unmapped. Verify actual transaction identity
      sets, not only equal sums which could hide compensating wrong lines.
- [ ] Reuse stage 4 production predicate; no mirrored filters/alias/mapping rules. Include component
      descendants, measure-filter result identity and whole-scope total where offered.
- [ ] Before marking a value drillable, summarize the full transaction set and compare exact paise
      to the displayed Actual. Mismatch returns a typed detail error and audit finding, never wrong rows.
      Zero net can still have contributing offsetting transactions.
- [ ] Enforce at most 50 distinct prepared scopes including overall total. Deduplicate identical
      coordinates; if the answer cannot fit, ask to narrow rather than prepare an incomplete promise.
- [ ] Budget/Roll-over/% cells never get transaction handles.
      Missing Budget does not disable an Actual handle: prove an Actual-only GL in a loaded
      Plant/month has its prepared first page and further paging, with the full contributing
      transaction total equal to its displayed Actual.

### 5B: Prepare pages and preserve generation

- [ ] Write first_page_ready_full_total_not_page_sum, paging_stable_no_duplicates,
      permission_revoked_before_preparation, cross_user_handle_denied, expired_handle_rerun and
      source_replacement_keeps_pinned_generation_or_refuses.
- [ ] Query count/full total/page consistently from pinned source and mapping. Order by posting date
      then transaction number/line ID/internal ID with a deterministic tie-break; record ascending or
      descending choice in the stage 1 page contract. No unstable offset over changing active facts.
- [ ] Return page 1 with 10 rows; API default subsequent page 20/max 100, page starting at 1.
      Reject malformed/out-of-range input; an empty set has honest zero/count metadata.
- [ ] Recheck current permissions before each read; if any pinned Plant is no longer authorized,
      deny the scope rather than return a smaller inconsistent set. Server-held page data is not a
      grant cache; verify again before returning previously prepared data.
- [ ] Retained old generations remain immutable; unavailable/expired pin produces rerun reason,
      not active-load fallback. No automatic old-load deletion in the PoC.
- [ ] Define bounded parallel preparation batches without adding a queue. A partial detail failure
      marks only that handle failed; summary stays exact but UI cannot claim details ready.
      Stage 6 must call this tool before final completion, not defer every first page until click.

## Verification and handoff

- [ ] Run disposable real-DB proof against :5434 plus registered hermetic/typecheck/quality/structural.
      Compare full contributing transaction set independently of the production predicate builder.
- [ ] Hand off ready/error detail examples and list of opaque scopes; browser uses handles, not filters.
      Record expired-generation/mismatch/revoked-permission details.reason values.

**Done when:** Every advertised clickable Actual has a reconciled prepared first page and full
matching total, and further pages never change identity, source or owner.
**Review focus:** Offset pagination over reload; equivalent sums hiding wrong lines; revoked grants
on prepared cache; 50 rows plus total limit overflow; zero-net offsetting transactions.
