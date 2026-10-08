---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# Financial Actual and Nursery Budget schema for the new chat PoC

## Context
The owner approved this design in the chat on 2026-10-08 and requested that the locked
decisions be recorded. Users need factual answers across financial dimensions, including
monthly trends and the transactions behind an Actual. The warehouse remains the source of
truth. The current schema serves the existing MIS; this record defines the new chat's target
schema without changing the shipped tables or their consumers.

The supplied workbook is `5 Months Financial Data - Knack labs POC (1).xlsx`. Its Actual
sheet has multiple Plants and rows without Plant or Cost Center. Its Nursery Financial MIS
table has no explicit Plant column and repeats GL codes across different components.
Decision [0034](0034-poc-budget-owner-plant.md) assigns the current budget to DUB.

## Decision
### Actual transaction grain and columns

`financial_actual` stores one source transaction line. Uniqueness within a load is
`batch_id + transaction_number + line_id`; source-system identity belongs to the batch/row.

| Group | Columns |
| --- | --- |
| Identity | `id`, `batch_id`, `source_system`, `transaction_number`, `line_id`, `source_row_number` |
| Dates | `posting_date`, `reporting_month` derived from the posting date |
| Dimensions | `section`, nullable `plant_id`, nullable `cost_center_id`, `gl_account_id`, `consideration`, `short_name`, `contra_account`, `origin`, `location` |
| Source identifiers | `source_plant_code`, `source_cost_center_code`, `source_gl_code`, `source_gl_name` |
| Amounts | `debit`, `credit`, database-generated `actual_amount = debit - credit` |
| Descriptions | `line_memo`, `comment_1`, `comment_2`, `reference_1` |
| Evidence | original `source_row` JSON and `created_at_utc` |

Debit and Credit are required exact decimal `numeric(18,2)` values. Original identifiers
survive even when a lookup cannot resolve them; unresolved foreign keys must not force a
financially valid row to be discarded. Duplicate source lines are rejected or quarantined.
Description fields are retained and searchable; they are not grouping dimensions in v1.

### Budget grain and hierarchy

`nursery_budget` stores one leaf component, Plant and month per load. It includes
`budget_component_id`, `reporting_month`, `plant_id`, `gl_account_id`, `payment_office`,
`rollover_enabled`, `budget_amount`, `rollover_amount`, `batch_id` and source row evidence.
Unicity is `batch_id + plant_id + budget_component_id + reporting_month`. If the agreed
component model permits several GL lines per component, the grain must also include GL;
this detail must be resolved in the implementation plan before defining the constraint.

The workbook's monthly columns become monthly fact rows. Only source leaf Budget and
Roll-over amounts are stored. Workbook Actual and percentage columns are not imported as
financial facts. Parent subtotal amounts are derived from leaves, preventing double counting.

`nursery_budget_component` stores the hierarchy separately: `id`, `batch_id`, stable
`component_key`, nullable `parent_component_id`, `s_no`, `component_name`, `depth`,
`sort_order`, `is_leaf` and `source_row_number`. The hierarchy is retained with its load;
budget facts reference its leaves. Component keys, rather than upload-local IDs, connect
the approved Actual mapping to the hierarchy.

Plant, Cost Center and GL have separate lookup tables (`plant`, `cost_center`, `gl_account`).
Aliases require explicit approved normalization, never model inference. All dimensions are
available for Actual-only reads where approved by the catalogue. Budget may be returned at
a dimension only if its native grain or an approved mapping supports that dimension. In
particular, a component's Budget must never be repeated across its several Actual Cost Centers.
No budget allocation is introduced for v1.

### Actual mapping and missing Plants

`actual_budget_mapping` connects one approved `Plant + Cost Center + GL` combination to
one stable Nursery leaf key. Its columns include `id`, `mapping_version_id`, `plant_id`,
`cost_center_id`, `gl_account_id`, `budget_component_key`, `created_at_utc` and `approved_by`.
The combination is unique within a mapping version. Several combinations may target one leaf;
one Actual is never split between leaves. No GL-only fallback is allowed. Section, Origin
and Location do not participate in the agreed key.

The profile performed in this chat found no conflicting targets in the existing mapping
master. This proves structural consistency for those recorded assignments, not independent
business confirmation of every correspondence. Provisional mappings remain provisional under
decision [0022](0022-mis-statement-governed-projection.md); the profile does not resolve them.

If Plant is known but component mapping is absent, the transaction remains in that Plant's
Actual totals under **Unmapped**. A missing Cost Center also prevents component assignment.
If Plant is missing or unresolved, retain the transaction as **Plant unknown** and exclude it
from Plant-scoped results. Only users explicitly allowed to review unassigned transactions
may access it. A load-level reconciliation still accounts for all rows, including these rows.

### Budget ownership and calculation rules

Each budget load has a declared Plant owner. The supplied workbook belongs to DUB according
to decision 0034. Each future budget upload states its owner explicitly. Actual and Budget
compare only for the same Plant, month and approved component/aggregate scope. Budget is never
copied to other Plants. Missing coverage says **Budget not loaded for this Plant or month**;
it remains null, distinct from a loaded zero. An all-Plants or multi-month answer with missing
budget coverage must identify that incompleteness instead of presenting a complete comparison.

`% = Actual / Budget * 100`, calculated from matching aggregate totals rather than averaging
row percentages. A zero or missing Budget produces **Not applicable**. Roll-over remains a
separate measure. Consistent with [0041](0041-use-stored-rollover-values.md), monthly trends
show each month's stored Roll-over; a range/YTD summary uses the closing month's Roll-over,
not the sum of monthly balances.

### PoC load controls

Use the single supplied budget for each Plant. A revised-budget approval/history workflow
is deferred for the demo; retaining the source load and hierarchy does not introduce that
workflow. `ingestion_batch` records source identity, counts, validation and reconciliation;
row errors may live in its JSON initially instead of a separate `ingestion_error` table.

Before using a load, reconcile source/loaded Actual row counts, Debit and Credit totals,
and monthly leaf Budget totals. Account explicitly for rejected/duplicate rows and unknown
Plants. A failed reconciliation prevents the agent using the load. This does not certify
upstream financial entries as correct; it proves the load preserves the supplied source.

## Consequences
- This is a target data design, not an executed migration. Physical DDL, indexes, stable
  component identity rules and the cutover/migration route belong in the implementation plan.
- Existing reports keep their accepted contracts until a story explicitly replaces them.
  This record does not globally supersede their scoped GL-month relations or ingest policies.
- The new chat must have proof against duplicate joins, repeated GLs, unmapped rows, unknown
  Plants, zero/missing Budget, partial period coverage and reconciliation mismatches.
- Mapping versions support reproducible reads; a mapping administration workflow is not part
  of this PoC decision. Never infer an unapproved mapping while answering a question.
