# Stage 8: React Financial Chat Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Let users clarify questions, read exact financial answers/trends and open prepared Actuals.
**Architecture:** Independent flag-gated page adapts shadcn template presentation to stage 7's
LangGraph transport; locally registered fixed components consume one verified server result.
**Tech Stack:** Existing Next.js/React, Tailwind tokens, shadcn, lucide and installed Recharts.
**Spec:** [Financial chat](../../specs/langgraph-financial-chat.md).
**Global constraints:** [Master](2026-10-08-financial-chat-master.md).
**Dependencies:** Stages 1 and 7. Use app-baseline for UI; no old Ask component/logic reuse.

## Files and ownership

- Create frontend/app/(app)/financial-chat/page.tsx.
- Create frontend/src/features/financial-chat/financial-chat.tsx, use-financial-chat.ts,
  financial-result.tsx, monthly-trend.tsx, clarification-card.tsx,
  actual-transactions-panel.tsx and focused behavior tests.
- Expand stage 1/7 financial-chat.transport.ts, no second stream implementation.
- Modify the rebased app-shell navigation owner for a flag-gated link and breadcrumbs.
- Install only required absent shadcn primitives via CLI into existing components/ui.
- Modify frontend/package.json/lock/test discovery only if a proven missing dependency is needed.
- Preserve template MIT attribution in copied files/license notice. Exclude its API agent, AI SDK
  useChat pipeline, gateway credentials and unsupported Next/Tailwind upgrades.

## Component contracts

Render available-data Actual subtotals with the exact completeness-unconfirmed label and
prepared clickable handles, separate from complete Actual/"Actual data not loaded".
Do not draw them into complete-Actual series or compute ratios/deltas from them. Every
synthetic result prominently says "Synthetic test data". Paging after refresh uses current
authorized pinned-size metadata and explains typed invalid/change/past-end outcomes.

| Component               | Input and behavior                                                        |
| ----------------------- | ------------------------------------------------------------------------- |
| FinancialTotal          | Scope, server totals/states and Actual handle; short deterministic answer |
| FinancialComparison     | Server rows/totals/coverage; labelled columns and clickable Actuals only  |
| MonthlyTrend            | Server monthly rows/deltas, exact table and same per-month Actual handles |
| ClarificationCard       | Pending request/field choices; typed reply referencing that request       |
| ActualTransactionsPanel | Prepared dictionary page or typed failure; full total/count and paging    |

Unknown component IDs/props fail validation; no eval/runtime-generated React or remote executable
component fallback. The final answer is renderable independently of earlier partial frames.
Unfiltered component comparisons keep the server's Unmapped row visible and its Actual
drill-down usable. Distinguish hierarchy subtotals from leaves; do not add them again.
Unmapped Budget says "No Budget assigned to Unmapped"; percentage says "Not applicable".
Preparation timeouts preserve the exact answer with honest per-scope detail failure guidance.

## Tasks

### 8A: Chat lifecycle and clarification

No financial-report permission shows access denied; report permission with no Plant grants
shows guidance to request access and no financial data. Use authenticated server capability
metadata, not client-generated permissions; clear cached data when access is revoked.

- [ ] Write user-flow tests incomplete_question_shows_clarification, choice_completes_pending_request,
      followup_reuses_confirmed_scope, new_chat_empty, refresh_resumes_live_id and
      stale_restart_shows_new_chat_guidance.
- [ ] Adapt input/messages/loading/stop/new-chat presentation from template to use-financial-chat.
      Keep conversation ID in a scoped URL/client store without treating possession as authority.
      Never persist financial results in unscoped localStorage.
- [ ] Handle pending, unsupported, empty, error and cancelled states with clear next action;
      prevent duplicate submits while active. Render typed field validation inline.
- [ ] Show Plant/period/grouping/filters used. A multi-Plant answer names approved scope rather than
      silently presenting DUB Budget as all Plants. No extra source/freshness badge work.

### 8B: Exact financial components and trends

- [ ] Write large_signed_money_stays_exact, percentage_not_applicable, incomplete_budget_label,
      trend_table_matches_chart_labels, no_budget_gap_drawn_as_zero and unmapped_visible_once.
- [ ] Format canonical money strings without converting full exact amounts through floating-point
      arithmetic. Use locale grouping/currency labels and tabular figures; keep sign and two decimals.
      Numeric chart coordinates may be approximations, but tooltips/table show original exact strings.
- [ ] Render one result model in text/table/chart; no client reaggregation, percentages or deltas.
      Monthly percentage change with a negative prior says "Not applicable — previous month
      was negative", while keeping the server's exact monetary delta. Do not confuse this
      with Actual-vs-Budget percentage or calculate an absolute-denominator substitute.
      Monthly rows chronological, labelled axes, series distinguished beyond color, exact table
      accessible alongside chart. Missing/unloaded values are gaps, not zero or interpolated lines.
      Keep "<Dimension> not assigned" Actual groups visible with prepared drill-down.
      Display "Actual data not loaded" for unconfirmed Plant/month completeness; show zero
      only for confirmed complete coverage with no matching lines, never from absence alone.
- [ ] Explain available Budget subtotal versus incomplete full comparison. Zero denominator is
      Not applicable. No fake/loading/example amounts as real financial results.
      An Actual-only GL in a loaded Budget month displays "No Budget line for this GL"
      and Not applicable percentage, while its exact Actual remains clickable with prepared details.
      Keep "GL not assigned" rows visible for Budget leaves without GL. Do not hide null-key
      groups or calculate their totals in React; Budget cells remain non-clickable.
- [ ] Use shadcn Chart wrappers on installed Recharts, theme tokens and native elements where suitable.
      No second chart library or hand-rolled dialog/table primitive.

### 8C: Prepared transactions and accessible shell

- [ ] Write actual_click_uses_prepared_first_page, budget_not_clickable, later_page_keeps_full_total,
      detail_failure_not_ready, revoked_permission_clears_cache and result_reference_is_unambiguous.
- [ ] Actual opens prepared panel immediately, without another LLM turn. Further page fetch uses
      same opaque handle via stage 7; display full matching total separately from current page/count.
- [ ] Show required transaction columns and no first-page-as-total mistake. Detail error has
      rerun/retry action consistent with its typed reason; expired scopes don't silently reload newer data.
- [ ] Fit within existing shell/navigation/theme/profile/sign-out patterns; do not rebuild unrelated
      dashboard/auth screens. Add page title/header, breadcrumbs and one clear primary action.
- [ ] Keyboard test clarification, send/stop/new-chat, Actual buttons, dialog focus trap/return and
      paging. Check mobile widths, light/dark, readable contrast, labels, visible focus and table
      alternative; reduced-motion and frequent keyboard interactions avoid gratuitous animation.
- [ ] Apply app-baseline design review; if impeccable/emil-design-eng skills are unavailable at
      implementation time, record that limitation and perform explicit bounded accessibility/
      interaction review rather than claiming those skills ran.
- [ ] Expose /financial-chat only when enabled. Do not replace/redirect old Ask or report dock in
      this stage; separate cutover is an explicit future approved scope.
- [ ] Obtain availability from stage 7's authenticated runtime capability response; flag changes
      update the page/navigation without rebuilding the frontend. A disabled response clears cache.

## Verification and handoff

- [ ] Run focused frontend behavior tests and npm run test:frontend, quality/typecheck/structural.
      Stop dev servers before frontend builds; isolate/move .next before restarting if needed.
- [ ] Browser walk through real API/DB at 127.0.0.1:3000; inspect the same golden answer in
      table/chart/detail. Use synthetic disposable data for edge scenarios, not hardcoded live amounts.
- [ ] Hand off component map, tested screenshots/accessibility findings and flag-off behavior.

**Done when:** Exact scoped answers and ready transaction details are usable across keyboard,
mobile and themes, and incomplete/expired states never masquerade as complete data.
**Review focus:** Float formatting of large money; chart zero-filled gaps; wrong Actual cell handle;
stale cross-user local cache; clarification losing pending request identity.
