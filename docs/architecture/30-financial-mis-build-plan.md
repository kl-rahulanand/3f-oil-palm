# Financial MIS — build plan (Phase 1 PoC)

Solution/build plan for the first deliverable. Derived from decision
`0002-phase1-financial-mis`, the data model in `20-financial-mis-data-model.md`,
and Srihari's confirmed requirements (2026-08-20 email thread; his answers folded
in below). Sources: `docs/context/2026-08-20-srihari-phase1-data/`.

Status: draft build plan (discovery/prototype phase). The formal roadmap + task
decomposition follow capability specs and client sign-off; this doc seeds them.

## What we're building

A read-only web app where a user selects **Department → Function → Plant** and the
system generates that unit's **Financial MIS** — the exact report format, with
**Actuals computed from SAP**, **Budgets carried from the format**, every Actual
**clickable down to its transactions**, and the report **downloadable**.

## Confirmed requirements (Srihari, 2026-08-20)

- Inputs model confirmed: SAP Base Report = source of Actuals; MIS Format sheet =
  template **and** the Budget/Roll-over source; mapping tab = the bridge.
- **Actual = Σ(Debit − Credit)** for the matching key, per month (net, not Debit-only).
- **Composite key = Plant + Cost Center + GL Code** — Cost Center distinguishes the
  same GL across Primary vs Secondary; all three are always used together.
- **Drill-down on Actuals only** (Budget is not clickable). Clicking an Actual opens
  a **line-items** view: Month, Debit, Credit, Value, + other txn details; default
  sort **Value largest→lowest**, **Month latest→oldest**.
- **Config-driven selection:** user picks Department/Function/Plant; the system
  resolves the applicable Cost Centers + GL codes + which MIS Format, validates by
  GL+CostCenter+Plant, extracts only that slice, renders it in the format, and
  downloads per plant. **Must not depend on the source Excel file/sheet name.**
- Zero-valued combinations are still shown (never skipped).

## Phase-1 scope (given current details)

Deliberately narrow, to prove the full vertical slice on real data:

- One slice: **Agriculture → Nursery → DUB**. One month: **July 2026**.
- **Excel-upload ingestion** of the SAP Base Report (no live SAP yet).
- **Mapping Master seeded** from `SAP Entries Mapping.xlsx` (Sheet1), with the 7
  missing GLs (`50001701–706`, `50001905`) added.
- **One format** (Nursery Financial MIS, Table-2) encoded as data, with its budgets.
- Drill-down + Excel export + a validation pass against Srihari's manual MIS.

Everything above the slice (more plants, admin editing, history, live SAP, chatbot)
is designed-for but deferred.

## Pipeline

```
SAP Base Report (Excel upload)  ─┐
                                 ├─►  Ingest & stage raw transactions (Postgres)
MIS Mapping Master ──────────────┤     normalize keys (Plant+CostCenter+GL); net Debit−Credit
Format template + Budgets ───────┘
            │
            ▼
   Generation engine (given Dept/Function/Plant + month):
     1. resolve applicable Cost Centers + GL codes + format   (from the Master)
     2. Actual = Σ(Debit − Credit) per (Plant, Cost Center, GL), per month
     3. join Budget from the format; compute % = Actual / Budget
            │
            ▼
   Report UI → render MIS grid → click an Actual → line-items view
               (download as Excel)  (Month, Debit, Credit, Value; sort Value↓, Month↓)
```

The **Mapping Master** is the heart of the system — it is what makes generation
generic (Dept/Function/Plant-driven) rather than a hard-coded nursery sheet.

## Data model (Postgres)

- `sap_transaction` — raw lines: txn_no, line_id, posting_date, month, plant,
  cost_center, gl_code, acct_name, debit, credit, memo, reference, source_batch.
  (The drill-down source.)
- `mis_mapping_master` — (plant, cost_center, gl_code) → budget_component,
  department, function, format_id, payment_office, rollover_flag. Seeded from the
  Excel; admin-editable later.
- `mis_format` / `mis_format_line` — the template: ordered line items, UoM, period
  columns, parent grouping. Nursery = instance #1.
- `mis_budget` — budget + rollover_budget per format line per period.
- `dim_plant / dim_department / dim_function` — selection dimensions.
- Derived rollup (view or materialized): `actual_by_key_month = Σ(debit − credit)`
  grouped by (plant, cost_center, gl_code, month) — one definition reused by the
  report, the drill-down, and (later) the chatbot.

## Tech stack (as adopted)

> This section was an early greenfield baseline. platform-base instead **adapts Pulse**
> (decisions 0003/0006/0008), so the *as-built* stack below supersedes the original
> baseline of "Nx · Postgres + Prisma · OIDC · `/api/v1`". Any future move to Nx, Prisma,
> OIDC, or API versioning is a **deferred, separate decision** — not assumed here.

**As adopted:** **npm workspaces** monorepo (`backend`, `contract`, fresh `frontend`;
Nx deferred — decision 0008, `constitution/01-monorepo-standard.md` deviation) · NestJS
API under `api/*` (e.g. `api/auth`; no `/api/v1` versioning yet) · **Next.js (App
Router) + React** web (fresh from the Claude Design, decision 0007) · **Postgres +
Drizzle** (not Prisma) · **email+OTP passwordless auth + RBAC** (vendored from Pulse;
OIDC deferred) · Docker. Ingestion (Redis + BullMQ workers, Excel in/out via `exceljs`)
arrives with the ingestion story. Warehouse engine stays **Postgres** for the PoC
(BigQuery remains the deferred, evidence-based call). The generation engine is a NestJS
module + Postgres views — no Cube, no new services. Production deployment readiness
(SES, secrets/CORS, audit retention/encryption, residency, `/deployment/<env>`) is
deferred (decision 0011).

## Milestones

| # | Milestone | Delivers |
|---|---|---|
| M0 | Scaffold + schema + auth | Running app, Postgres tables, login (mostly from scaffold) |
| M1 | Ingestion | Upload SAP Excel → parsed, idempotent raw transactions |
| M2 | Mapping Master + Format | Seeded master (7 GLs fixed) + Nursery format & budgets as data |
| M3 | Generation engine | Nursery July actuals computed, budget-joined, %-ed |
| M4 | Report UI | Selection → rendered MIS grid matching the format |
| M5 | Drill-down + export | Click Actual → line items (sorted); Excel download |
| M6 | Validation | Reconciled against Srihari's manual MIS |
| later | Generalize | More Dept/Function/Plant, admin UI, history, live SAP, chatbot |

## Assumptions & open items (carried, not blocking the PoC)

- **Mapping Master structure** — using the inferred shape until Srihari's cut-off
  "Master Table" definition arrives; may need columns added.
- **Budget for non-nursery plants** — unanswered; the PoC only needs Nursery budgets
  (already in the format).
- **Payment Office (HO/LO/HOD)** — treated as static per-line metadata for now.
- **`DUB-NUR` vs `DUB`** — assumed the same plant, normalized in the master.
- **History** — only July exists; the schema is period-aware so more months drop in
  without redesign.

## Top risks

1. **Mapping completeness** — the stale-mapping issue is the #1 correctness risk;
   the admin-editable master is the mitigation.
2. **SAP extraction for "live"** — biggest hidden-complexity item; stays behind
   Excel-upload until spiked.
3. **Format fidelity** — reproducing the multi-table, multi-period layout exactly
   (especially Excel export) is fiddly; M2 de-risks it by encoding the real format early.

## Related

- Decisions: `docs/decisions/0002-phase1-financial-mis.md`, `0001-poc-engagement-scope.md`
- Data model: `docs/architecture/20-financial-mis-data-model.md`
- Source systems: `docs/architecture/10-source-systems.md`
- Raw context: `docs/context/2026-08-20-srihari-phase1-data/`
