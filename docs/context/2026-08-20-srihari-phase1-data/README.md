# Phase-1 data delivery from Srihari — 2026-08-20

Raw client input: Srihari (3F data owner) sent the first real data for the PoC,
scoping **Phase 1 to the Financial MIS**. Two Excel files live in this folder
(the untouched raw record). This note transcribes the email verbatim and records
the structural analysis of both files, so the harvest has a text source.

---

## Srihari's email (verbatim)

> Hi Sir,
> Please find the attached Excel sheets.
> For the first phase, we are going with the Financial MIS Sheet. For this phase, I am providing the Basic Data required to generate the Financial MIS reports.
>
> **Basic Data / Files**
> 1. SAP Data / Base Report – Detailed SAP transaction data.
> 2. MIS Format Sheet – Sample Financial MIS format.
>
> **Requirement**
> * The SAP Basic Data / Base Report will be the source data for generating the Financial MIS.
> * MIS reports need to be generated based on the combination of: Plan, Cost Center, GL Code.
> * The attached MIS sheet is only one sample format. Based on the same format and logic, different MIS sheets need to be generated for the respective Plan + Cost Center + GL Code combinations.
> * Even if a particular combination has no transaction data, the corresponding MIS sheet should still be generated with Zero values. The report should not be skipped.
> * The Basic Data should be analyzed and mapped with the MIS format before generating the reports.
>
> Please first review the SAP Basic Data, column structure, Plan/Cost Center/GL combinations, and sample Financial MIS format. If you have any doubts regarding the mapping, combinations, calculations, or report logic, please let me know.

("Plan" is read as "Plant" throughout — SAP has no "Plan" field.)

---

## File 1 — `Nursery MIS Format.xlsx` (the target report)

Three stacked tables on the `MIs Format` sheet (95 cols × 599 rows). A `Plant list`
sheet lists 18 plants.

| Table | Rows | Content | Unit |
|---|---|---|---|
| Table-1 Operational MIS | 6–474 | Nursery stock flow: opening stock, sprouts purchase, transit/germination/culling losses, sales (AE / gap-filling / out-of-zone), closing inventory, lead times | physical counts (`No.`) |
| **Table-2 Financial MIS** | 479–588 | **Phase-1 scope.** Cost budget-vs-actual by GL code | money |
| Table-3 Payment Office | 591–597 | HO / LO / HOD roll-up | money |

**Table-2 columns:** S.No · Budget Component · Rollover (Y/N) · Payment Office
(HO/LO/HOD) · **GL Codes** (join key, col F) · then per-period blocks for
YTD 22-23, YTD 23-24, FY24-25, FY25-26, FY26-27-YTD, and each month Apr-2026 →
Mar-2027. Each period block = **Budget · Roll Over Budget · Actual · %**.

**Table-2 component tree** (matches the SAP mapping one-for-one): 1 Imported Sprouts ·
2 Indigenous Sprouts · 3 Land Levelling · 4 Materials Primary Nursery ·
5 Materials Secondary Nursery · 6 Materials Tertiary Nursery · 7 Labour ·
8 Manpower · 9 Admin (14 sub-lines) · 10 Indigenous Sapling · 11 Import Sapling ·
12 Sapling Subsidy · 13 Advances · 14 Transportation · 15 CAPEX.

## File 2 — `SAP Entries Mapping.xlsx` (source + bridge)

- **`SAP Report`** — 4,113 transaction lines, **July 2026 only**, company-wide
  (31 distinct Plant values). Key columns: Plant · Cost Center · MIS GL Code ·
  AcctName · Debit · Credit (+ transaction no, posting date, memo for drill-down).
- **`Sheet1` ("New SAP")** — the mapping: (Plant + Cost Center + GL code) →
  Revised GL name / budget component. Covers the **Nursery (Plant "DUB") only.**
- **`Sheet4`** — a plant/row-label list (Grand-Total pivot leftovers).

## The mechanic

For each report cell: `Actual = Σ(Debit − Credit)` of SAP lines matching that
**Plant + Cost Center + GL code**, for that month. Budget columns are pre-entered
planning values; only Actuals come from SAP. The nursery (`DUB-NUR`) is 88 of the
4,113 lines and nets **₹11,512,712** for July 2026.

---

## Open mapping issues (surfaced for Srihari — the "doubts on mapping" he invited)

1. **7 live SAP GL codes are missing from the mapping sheet:** `50001701–50001706`
   (Secondary-Nursery materials) and `50001905` (Nursery labour transport). The
   mapping lists Secondary materials under a different (Primary) GL series, so a
   straight join drops real spend. → **Mapping is stale vs. the live chart of accounts.**
2. **Cost-center tagging in SAP contradicts the mapping logic.** Secondary items
   (`5000170x`) are booked under Cost Center `Primary` in SAP; "Land Levelling SN"
   sits under `secondary`. The composite key won't resolve cleanly. → need the
   authoritative rule (which field wins).
3. **GL code is not unique alone** — `50001201` (Sprout Cost) maps to 4 components;
   `50001605` (Fertilizers) spans Primary/Secondary/Tertiary. Confirms the composite
   key is mandatory (and #2 is what breaks it).
4. **Plant naming mismatch:** SAP = `DUB-NUR`, mapping = `DUB`. Need a normalization rule.
5. **Scope of "different MIS sheets":** SAP is company-wide (31 plants); the sample
   format + entire mapping cover only the Nursery. Is Phase 1 the Nursery sheet
   alone, or one sheet per plant (plantations/mills have different cost lines)?
6. **"Payment Office" (HO/LO/HOD)** has no source column in SAP — appears to be
   static metadata per component. Confirm.
7. **Only July 2026 is in the extract.** The format wants FY22-23…FY25-26 history +
   12 months of FY26-27. From this extract only the **July Actual** column can be
   populated; history is not present.
