# Stage 2: Additive Financial Warehouse Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Store source-complete Actuals and monthly Nursery Budget without touching report data.
**Architecture:** Eight schema-qualified tables in agent_financial with immutable load evidence,
stable component identity and explicit availability metadata.
**Tech Stack:** Existing Postgres warehouse, Drizzle migrations, pg and exact NUMERIC.
**Spec:** [Financial chat](../../specs/langgraph-financial-chat.md).
**Global constraints:** [Master](2026-10-08-financial-chat-master.md), especially accepted 0042.
**Dependencies:** Stage 1 types; inspect latest warehouse migration journal before numbering.

## Files and ownership

- Create backend/src/financial-data/financial-schema.ts and financial-schema.db.test.ts.
- Create the next additive SQL migration and journal metadata under backend/drizzle-warehouse/.
- Modify warehouse migration wiring only if the existing runner needs this schema included.
- Modify backend/package.json and tools/quality-gate.test.mjs for named leaf/proof registration.
- Do not edit legacy warehouse-schema.ts/table definitions or rewrite merged migrations.

## Table definitions to implement

| Table                    | Grain and required fields                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| financial_actual         | id, batch_id, source_system, transaction_number, line_id, source_row_number, posting_date, derived reporting_month, section, nullable plant_id/cost_center_id/gl_account_id, source_plant_code/source_cost_center_code/source_gl_code/source_gl_name, consideration, short_name, contra_account, origin, location, debit, credit, generated actual_amount, line_memo, comment_1, comment_2, reference_1, source_row JSON, created_at_utc |
| nursery_budget           | id, batch_id, plant_id, budget_component_id, reporting_month, gl_account_id, payment_office, rollover_enabled, budget_amount, rollover_amount, source_row_number, source evidence and created_at_utc                                                                                                                                                                                                                                     |
| nursery_budget_component | id, batch_id, component_key, parent_component_id, s_no, component_name, depth, sort_order, is_leaf, source_row_number and source evidence                                                                                                                                                                                                                                                                                                |
| plant                    | canonical code/name, approved source aliases, identity and audit metadata                                                                                                                                                                                                                                                                                                                                                                |
| cost_center              | canonical source/Plant-scoped code/name, approved aliases and identity                                                                                                                                                                                                                                                                                                                                                                   |
| gl_account               | canonical source code/name, approved aliases and identity                                                                                                                                                                                                                                                                                                                                                                                |
| actual_budget_mapping    | id, mapping_version_id, plant_id, cost_center_id, gl_account_id, budget_component_key, approval/provisional provenance and created_at_utc                                                                                                                                                                                                                                                                                                |
| ingestion_batch          | id, source/dataset identity, source checksum, parser/mapping version, declared budget owner, state, active generation, Actual/Budget month coverage, counts, validation/reconciliation/error JSON, source timestamps and importing actor                                                                                                                                                                                                 |

Actual is one source transaction line, unique by batch_id + transaction_number + line_id.
Source evidence includes original row index even when identifiers cannot resolve.
Budget is one source GL-bearing leaf per month/Plant/load, unique by
batch_id + plant_id + budget_component_id + reporting_month; parent rows never become facts.
Multi-GL parent lines become distinct leaf identities, not one fact with duplicated amounts.
Mapping tuple is unique within a mapping version and points to one stable component_key.

## Interfaces and draft load lifecycle

Produces physical schema consumed by stage 3 and query scope consumed by stage 4.
Use immutable batches and explicit staged -> validated -> active or failed states.
For the single-workbook PoC, activate a complete reconciled workbook generation atomically;
its Actual and Budget sides carry separate Plant/month coverage. Keep prior generations for
existing pinned handles. Do not introduce partial replacement of a few months without an
explicit tested coverage/activation policy. The inactive replacement cannot mix with active facts.
This technical lifecycle is a proposed implementation detail, not a revised-budget workflow.

## Tasks

### 2A: Constraints and source integrity

- [ ] Write disposable-DB cases rejects_duplicate_actual_line, rejects_duplicate_budget_leaf_month,
      preserves_unresolved_dimensions, computes_actual_and_month, rejects_mapping_collision and
      preserves_parent_leaf_integrity. Verify invalid rows really reach the intended constraint.
- [ ] Use numeric(18,2) for Debit/Credit/Budget/Roll-over and generated Actual. Derive reporting_month
      from posting_date using an immutable calendar expression supported by the installed Postgres.
      Reject overflow before activation. Money is not float/double.
- [ ] Require facts to reference the correct batch and Budget leaf/Plant; reject cross-load parent
      links, orphan/cyclic hierarchy and facts on parent nodes. Enforce via DB where feasible,
      with stage 3 validation for whole-tree invariants.
- [ ] Persist original identifiers when FK is null. Do not require Plant/Cost Center to preserve
      valid Actual money. Do not globally unify similarly named source Cost Centers.
- [ ] Ensure approved aliases cannot create two canonical targets; unknown remains unresolved.
      No fuzzy mapping or GL-only fallback.
- [ ] Add audit actor/timestamps applicable to mutable/load metadata. Because app and warehouse
      databases are separate, retain authenticated actor identity as provenance; do not attempt
      cross-database foreign keys to app Account.

### 2B: Safe migration, indexes and availability

- [ ] Add indexes on FK/filter/join paths: batch, Plant/month, GL, Cost Center, component hierarchy
      and mapping tuple. Add active-generation uniqueness/serialization appropriate to the PoC dataset.
- [ ] Store coverage explicitly even for all-zero months; loaded-zero cannot be inferred from the
      presence of nonzero facts. Coverage is relational identity plus batch metadata, never a guessed
      value from a missing row.
      Pin completeness evidence to each Plant/month and generation, including confirmed empty
      months. No blanket all-known-Plants coverage from a workbook or nonzero-row presence.
- [ ] Apply through the existing warehouse migration runner twice to prove journal idempotency.
      Capture legacy catalog definitions before/after; app migrations cannot create these tables.
- [ ] Test failed generation invisibility, atomic switch and old-generation retention. No DROP,
      rename, destructive down migration or background purge.
- [ ] Document schema names and immutable fact/lifecycle rules for stages 3-5.

## Verification and handoff

- [ ] Run the named database leaf only against throwaway warehouse 127.0.0.1:5434; register it in
      warehouse-proof routing and gate. Check the chosen host/port before any truncation.
- [ ] Run hermetic suites without databases, quality/typecheck/structural and migration proof.
      Existing statements and warehouse proofs must still pass.
- [ ] Commit scoped migrations/schema/registries through Forge and hand off DDL/coverage identity.

**Done when:** Complete valid data can be represented, invalid keys cannot silently duplicate facts,
and applying the schema changes no legacy object.
**Review focus:** Formula parent double-count; missing-Plant row rejection; nullable key collisions;
multi-month activation ambiguity; generated-date SQL compatibility.
