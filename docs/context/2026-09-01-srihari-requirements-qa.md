# Srihari's answers to our clarifying questions — 2026-09-01

Raw record of Srihari's replies to the confirmation email (our questions on
inputs, the Actual calculation, drill-down, and mapping). Verbatim where quoted.
Note: the final "Master Table" section arrived **cut off** — its structure is
still outstanding.

## 1. Understanding of inputs — CONFIRMED

Our model is correct: SAP Base Report = source of Actuals; MIS Format sheet =
template **and** source of Budget/Roll-over; the "New SAP" mapping tab = the
bridge (Plant + Cost Center + GL → MIS line). ("yes")

## 2. Actual calculation — CONFIRMED

**Actual = Σ(Debit − Credit)** (net, not Debit-only).

## 3. Actuals drill-down requirement (verbatim)

> - Drill-down should be enabled **only for the Actuals Amount**.
> - Budget Amount should **not** be clickable/drillable.
> - When the user clicks the Actuals Amount, open a detailed **Line Items** view.
> - The line items should show: **Month, Debit, Credit, Value / Amount**, and any
>   other relevant transaction details.
> - **Value** sorted **Largest → Lowest** by default.
> - **Month** sorted **Latest → Oldest**.
> - Example: `Actuals ₹25.50 Cr → Click → Actuals Line Items → sort Value Largest→Lowest → Month Latest→Oldest`

Srihari specified **one level** (Actual → transactions). Our design adds an
**optional 2-level** drill (group total → sub-lines → transactions) — **to confirm
with Srihari** whether a group total opens sub-lines or jumps straight to
transactions.

## 4. MIS output logic — Cost Center (verbatim intent)

> - Cost Center can be different for Primary and Secondary.
> - The system should use the combination of **Cost Center + GL Code + Plant** for
>   MIS validation.
> - The same GL Code may apply to both Primary and Secondary, so the Cost Center
>   must be considered along with the GL Code and Plant.

→ Confirms the **composite key = Plant + Cost Center + GL** (none wins alone).

## 5. MIS selection & output (verbatim intent)

When the user selects **Department: Agriculture**, **Function: Nursery**,
**Plant: Agri – Nursery – DUB**, the system should:
1. Identify the corresponding **Plant = DUB**.
2. Identify all applicable **Cost Centers** for that Department/Function/Plant.
3. Identify the applicable **GL Codes**.
4. Validate transactions using **GL + Cost Center + Plant**.
5. Pick the applicable **MIS Format** based on Department + Function.
6. Extract only the relevant DUB Nursery data.
7. Display in the Nursery MIS Format.
8. Download the MIS output based on the selected Plant.
9. The system must **not** depend on the source Excel sheet/file name to determine
   Department, Function, or Plant.

→ The app is a **parameterized generator**: Department → Function → Plant selection,
driven by a config master, not by filenames.

## 6. MIS Mapping / Master Table — OUTSTANDING

Srihari wrote "The system should maintain a centralized MIS Mapping Master:" and
the message **ended there**. The master-table structure (columns/keys) is still
needed from him — it is the config that drives selection + validation.

## Open items to confirm with Srihari
- The **Master Table** definition (cut off above).
- Drill-down: does a **group total** open sub-lines (our 2-level enhancement) or
  jump straight to transactions?
- Budget source for **non-nursery** plants (Phase 1 is Nursery only).
