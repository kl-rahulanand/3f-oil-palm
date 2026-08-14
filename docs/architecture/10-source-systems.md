# Source systems and system context

Harvested from `docs/context/2026-08-14-kickoff-notes-and-emails.md` (kickoff
walkthrough + post-NDA data request). Draft — firms up once the client shares the
actual exports/tables and the Yield/ha + OER rules.

## System context

The MIS reads from two upstream systems of record and writes to neither (v1 is
read-only, decision `0001-poc-engagement-scope`):

- **Smart Palm application (SQL Server)** — pre-factory / grower side. Farmer and
  plot details, farmer lifecycle (editable), plots. Carries field sizing, crop
  sizing, nutrients, and onboarding data points. ~60,000 plots today, growing
  ~6,000–7,000 plots/year.
- **SAP** — factory side. Fruit intake and extraction process data:
  temperature, thrasher size, yield, etc.

The operation has two phases that map to the two systems: (1) **before the fruit
reaches the factory** (farmer onboarding, field/crop sizing, nutrients — Smart
Palm) and (2) **inside the factory** (temperature, thrasher size, yield — SAP).
Fresh fruit bunches (FFB) are trucked from plots to the factory.

## What the MIS produces

- Monthly management reporting, today hand-compiled in Excel from both systems.
- Headline metrics: **Yield per hectare** and **OER (Oil Extraction Rate)**.
- **Monthly targets** are tracked live against actuals.

## Integration constraints (to confirm)

- **Access mechanism** — Smart Palm SQL Server access and SAP access will be
  provided; exact path (read replica / direct / export for SQL Server; export /
  API for SAP) is open. SAP extraction is the largest hidden-complexity risk and
  needs an early spike.
- **Freshness / "live"** — real-time vs near-real-time vs nightly is unconfirmed
  and gates whether ELT is batch or CDC/streaming.
- **Manipulation is upstream** — some Yield/ha and OER inputs are manually edited
  inside the source systems; detecting/flagging that is out of scope for v1
  (deferral D-0001). A read-only recompute inherits those values.

## Historical data + modeling notes

- **~10 years of history exists** across both systems and must eventually be
  imported. Volume unknown until the extract; working estimate ~10–50M fact rows
  (harvest events per plot + factory batches). This is **Postgres-comfortable** —
  scale does not force a managed warehouse at this size.
- **Two ingestion paths:** a one-time **bulk backfill** (COPY-based, load then
  index) and an ongoing **incremental sync**. The PoC ingests a **recent 1–2 year
  slice**; the full 10-year backfill is a scheduled follow-on.
- **Definition drift risk:** confirm whether the Yield/ha and OER definitions (and
  their inputs) stayed constant across the decade. If they changed, a 10-year
  trend compares different things.
- **Palm age / vintage is a first-class modeling requirement.** Oil-palm yield
  follows a maturity curve (negligible yr 1–3, peak ~yr 7–18, then decline). With
  plots planted across 10 years, a naive Yield/ha comparison confounds palm
  maturity with performance. The plot dimension likely needs **history (SCD)** so
  metrics can account for palm age. Confirm during the Srihari watch-along.

## Related

- Decision: `docs/decisions/0001-poc-engagement-scope.md`
- Deferral: `plans/deferrals.md` → D-0001
- Design doc: `.gstack/projects/3oilpalm/caw-dev-master-design-20260814-110242.md`
