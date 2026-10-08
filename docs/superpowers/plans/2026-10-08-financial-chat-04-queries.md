# Stage 4: Governed Financial Queries Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Return accurate authorized totals, comparisons and monthly trends from reconciled facts.
**Architecture:** One FinancialDataService owns a code-authored catalog and parameterized queries.
Actual and Budget aggregate independently at compatible grain before joining.
**Tech Stack:** NestJS, pg/Drizzle, exact decimal/paise operations and shared validated contracts.
**Spec:** [Financial chat](../../specs/langgraph-financial-chat.md).
**Global constraints:** [Master](2026-10-08-financial-chat-master.md).
**Dependencies:** Stages 1-3.

## Files and ownership

- Create backend/src/financial-data/financial-data.module.ts, financial-data.service.ts,
  financial-catalog.ts, financial-query.repository.ts and financial-predicate.ts.
- Create financial-data.service.test.ts and financial-query.db.test.ts.
- Register leaves in backend/package.json, warehouse-proof script and tools/quality-gate.test.mjs.
- Export the data service, not tables/repositories, to the agent module. Use existing Core exported
  access/audit services without importing their private repositories.

## Interfaces

Produces getCatalog(userId), findValues(userId, dimensionId, search) and query(userId, selection)
with exact signatures from the master. financial-predicate.ts owns a ResolvedFinancialScope:
current authorized Plants, resolved date bounds, filters, mapping version, pinned source batches,
grouping and cell identity. Stage 5 uses that same builder for contributing Actual lines.
SQL values are parameters; identifier selection comes only from a server whitelist.

## Catalog matrix and measures

| Requested grouping                                                   | Actual                                              | Budget/Roll-over/%                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| None, Plant, month, GL and supported combinations                    | Yes                                                 | Only if native grain/approved mapping supports the exact combination |
| Nursery component / approved hierarchy parent                        | Yes through composite mapping                       | Leaf aggregation; parents derived, no subtotal facts                 |
| Cost Center                                                          | Yes                                                 | Unsupported without a separately approved allocation/correspondence  |
| Section, consideration, short_name, contra_account, origin, location | Actual-only if explicitly catalog-approved          | Not assumed compatible                                               |
| Memo/comments/reference free text                                    | Retained/searchable through governed detail filters | Not grouping dimensions in v1                                        |

Approve individual extra dimensions from source metadata; do not automatically expose every column.
Component filter resolves stable identity, not a substring or global GL fallback.
A GL Actual total and GL Budget use the same explicit Plant/month scope; do not multiply Budget
by the number of Actual rows/Cost Centers. Parent component totals include only their leaves,
not the entire Plant's Unmapped bucket.
An unfiltered component breakdown additionally includes a separate Unmapped row for
known-Plant Actuals without mapping. Prove mapped leaves plus this row reconcile to
same-scope Plant Actual, without counting derived parent subtotals again or allocating Budget.
Unmapped Budget is null/"No Budget assigned to Unmapped", percentage null/Not applicable;
it contributes no Budget to the comparison total. Test this separately from absent GL Budget.
Retain Budget leaves without GL in the "GL not assigned" group. Sum them once, without
inventing an Actual mapping. Prove grouped Budget including this group equals the same-scope
complete total, including repeated GLs and multiple missing-GL leaves.

## Tasks

### 4A: Validate and authorize vocabulary/selections

Require existing financial-report permission and Plant access through exported auth services.
The story pins the exact existing grant before coding; never broaden grants or reuse old-chat
logic. Test no report permission and no Plant grants at service entry points.

- [ ] Write boundary cases hides_unauthorized_dimension_values, rejects_unknown_grants,
      rejects_unsupported_budget_cost_center, rejects_unapproved_dimension and
      resolves_approved_alias_without_guessing. Check lookup scope before querying source values.
- [ ] Expose the four tool schemas from service contracts; getCatalog lists allowed combinations,
      April fiscal calendar, required scope and limits. findValues returns capped current-grant
      matches, with ambiguity preserved for graph clarification.
- [ ] Reject missing required/invalid fields, unsupported combinations, out-of-range dates,
      unauthorized Plants and invalid comparisons before executing financial reads.
      The service remains secure when invoked without an HTTP controller.
- [ ] Resolve explicit month/range/YTD once to calendar bounds, pin active generation and mapping
      within a consistent snapshot, and audit accepted/refused selections without financial rows.

### 4B: Implement exact aggregation and coverage

Retain nullable supported Actual dimensions under "<Dimension> not assigned", with exact
contributing scopes and grouped-to-total reconciliation. Test missing Cost Center/Section;
Unknown Plant remains operator-only. These buckets are not invented master IDs.

- [ ] Write real-DB cases repeated_gl_does_not_fan_out, parent_matches_leaf_sum,
      unmapped_included_once, unknown_plant_not_in_ordinary_total and
      exact_debit_minus_credit_preserves_sign. Use synthetic independent expected totals.
- [ ] Query all financially valid lines in permitted scope, including known-Plant Unmapped.
      Join approved mapping at most once per Actual; never coalesce to a guessed component.
- [ ] Aggregate Budget independently from monthly leaf facts. With no Actual lines but confirmed
      loaded Actual coverage return real zero; distinguish an unloaded Actual period/no matches
      and label the state rather than claiming a zero of data never loaded.
      Per decision 0048, unconfirmed completeness returns null/"Actual data not loaded",
      even if partial rows exist. Test confirmed-empty Plant/month, identical empty scope
      without coverage, and partial rows without completeness; keep partial subtotals labelled.
- [ ] Write budget_zero_is_loaded, other_plant_budget_not_loaded and missing_month_marks_partial.
      Coverage is per Plant/month, even when grouping collapses it.
- [ ] Write actual_only_gl_keeps_actual_and_missing_budget_line. In loaded Plant/month coverage,
      absent GL Budget leaves return null/"No Budget line for this GL" and Not applicable
      percentage. Preserve Actual-only groups in the aggregate join; never coalesce absent Budget
      to zero or discard their contributing Actuals. Stage 5 must retain their drill-down.
- [ ] If coverage is incomplete, expose actual total and the explicitly labelled available Budget
      subtotal with incomplete state; the complete comparison Budget and percentage remain null.
      Do not divide full-scope Actual by available-only Budget or auto-restrict the question.
- [ ] Calculate aggregate percentage server-side, null for zero/missing denominator.
      Preserve a server decimal ratio and a pinned display-rounding policy; do not derive it in React.
      Test values with negative Actual/Budget and offsets from credits without absolute-value guessing.

### 4C: Trends, rollover, limits and failure paths

- [ ] Write month_range_sums_flows, april_ytd_resolves_correctly, closing_month_rollover_only,
      ordered_monthly_gaps and monthly_delta_zero_or_missing_denominator. Include cross-year ranges.
- [ ] Return chronological month rows across requested scope. Actual coverage gaps remain unavailable,
      while a loaded month with no lines is zero. Budget absence is a null gap, not zero/interpolation.
- [ ] Monthly absolute change is current minus previous where both months are available; percentage
      change is Not applicable for previous zero/missing value. No causal explanation/forecast.
- [ ] Range/YTD sums Actual/Budget flows and takes closing month's stored Roll-over, respecting its
      coverage. Missing closing Roll-over cannot fall back to an earlier month.
- [ ] Apply approved measure filters after correct aggregation and define returned total scope
      explicitly. Never show pre-filter and post-filter totals under the same ambiguous label.
- [ ] Check row/prepared-scope limits before promising detail; return narrow-request outcome rather
      than silent truncation. Query failure/timeout does not return a fabricated successful result.

## Verification and handoff

- [ ] Execute registered real-DB proofs against :5434, compare to independent SQL/source oracle and
      run standard quality/typecheck/structural/hermetic checks.
- [ ] Hand off catalog combination matrix, ResolvedFinancialScope builder and exact rows/totals/
      coverage examples. Stage 5 may extend query output with handles but not change calculation rules.

**Done when:** All supported selections have exact, scoped, independently proven results and
unsupported/partial data states are explicit.
**Review focus:** Fact join fan-out; partial coverage ratio; loaded-zero vs unloaded Actual;
component total vs Unmapped Plant total; measure-filter total scope.
