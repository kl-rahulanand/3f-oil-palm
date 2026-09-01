# Financial MIS — data model and pipeline (Phase 1)

Harvested from `docs/context/2026-08-20-srihari-phase1-data/` (Srihari's Phase-1
data delivery: SAP Base Report + sample MIS format + structural analysis).
Draft — the open mapping issues below must be resolved with Srihari before build.

Scope of this doc: the **Financial MIS**, the first PoC deliverable
(decision `0002-phase1-financial-mis`). Read-only over SAP only.

## Source of record

SAP is the **financial ledger (FICO)** for this deliverable — general-ledger
transactions with Debit/Credit, tagged by Plant, Cost Center, and GL account.
(This is distinct from, and additional to, SAP's factory-extraction role noted in
`10-source-systems.md`.) Smart Palm is **not** involved in the Financial MIS.

### SAP Base Report (`SAP Report` sheet)

One row per GL transaction line. The extract provided is **July 2026 only**,
company-wide (4,113 lines, 31 distinct Plant values). Columns that matter:

| Column | Role |
|---|---|
| Plant | cost location (e.g. `DUB-NUR`, `H.O`, `AP-AGRI`) — part of the key |
| Cost Center | e.g. `Primary`, `Manpower`, `Admin`, `Imported Sprouts` — part of the key |
| MIS GL Code | GL account — part of the key |
| AcctName | sub-account description — **drill-down grain**, many per GL |
| Debit / Credit | amounts; `Actual = Σ(Debit − Credit)` |
| Transaction Number, Line_Id, Posting Date, LineMemo, ContraAct, Reference 1 | drill-down / audit trail |

### Mapping bridge (`Sheet1` "New SAP")

Maps `(Plant + Cost Center + GL code) → Revised GL name / budget component`.
Currently covers the **Nursery (Plant "DUB") only**.

## Target — the MIS format (`Nursery MIS Format.xlsx`)

Three stacked tables. **Phase 1 = Table-2 only.**

- **Table-1 Operational MIS** (rows 6–474) — nursery stock flow in physical units
  (`No.`). Later phase.
- **Table-2 Financial MIS** (rows 479–588) — **this deliverable.** Cost budget-vs-
  actual by GL. Columns: S.No · Budget Component · Rollover (Y/N) · Payment Office
  (HO/LO/HOD) · GL Code (join key) · then per-period blocks (YTD 22-23, YTD 23-24,
  FY24-25, FY25-26, FY26-27-YTD, and monthly Apr-2026→Mar-2027), each block =
  **Budget · Roll Over Budget · Actual · %**.
- **Table-3 Payment Office** (rows 591–597) — HO/LO/HOD roll-up.

Component tree (maps 1:1 to the SAP mapping): Imported/Indigenous Sprouts ·
Land Levelling · Materials Primary/Secondary/Tertiary Nursery · Labour · Manpower ·
Admin (14 sub-lines) · Indigenous/Import Sapling · Sapling Subsidy · Advances ·
Transportation · CAPEX.

## Pipeline (target shape)

1. Ingest SAP Base Report (per period).
2. Normalize keys (Plant, Cost Center, GL) and net `Debit − Credit` per line.
3. Join to the mapping bridge → budget component / MIS row.
4. Aggregate to Plant + Cost Center + GL × period → **Actual**.
5. Emit one MIS sheet per required combination, **zero-filled if empty** (never
   skipped). Budget columns come from planning input, not SAP.
6. Drill-down: every Actual traces to its SAP transaction lines (AcctName → line).

Nursery (`DUB-NUR`) sanity check on the July extract: 88 lines, net **₹11,512,712**
(largest single item: Imported Sprouts / Sprout Cost ₹8.4M).

## Open mapping issues (blockers — raise with Srihari)

1. **Stale mapping vs live chart of accounts.** SAP GL codes `50001701–50001706`
   (Secondary-Nursery materials) and `50001905` (Nursery labour transport) appear
   in the data but are **absent from the mapping sheet**, which lists Secondary
   materials under a different (Primary) GL series. A straight join drops this spend.
2. **Cost-center tagging contradicts the key.** Secondary items (`5000170x`) are
   booked under Cost Center `Primary` in SAP; "Land Levelling SN" under `secondary`.
   Need the authoritative rule for resolving the composite key.
3. **GL code is not unique alone** — `50001201` → 4 components; `50001605` spans
   Primary/Secondary/Tertiary. The composite key is mandatory; issue #2 breaks it.
4. **Plant naming** — SAP `DUB-NUR` vs mapping `DUB`. Need a normalization rule.
5. **Whole-company scope** — SAP is company-wide (31 plants); format + mapping cover
   only the Nursery. Is Phase 1 the Nursery sheet alone or one per plant?
6. **Payment Office (HO/LO/HOD)** — no SAP source column; appears to be static
   metadata per component. Confirm.
7. **History** — extract is July 2026 only; prior-FY / other-month columns need
   separate extracts.

## Related

- Decisions: `docs/decisions/0002-phase1-financial-mis.md`, `0001-poc-engagement-scope.md`
- Source systems overview: `docs/architecture/10-source-systems.md`
- Raw context: `docs/context/2026-08-20-srihari-phase1-data/`
