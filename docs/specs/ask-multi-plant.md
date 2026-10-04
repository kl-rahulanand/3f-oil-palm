---
slug: ask-multi-plant
title: Every Ask answer works across plants
status: draft
saved: 2026-10-04T06:33:04+00:00
---

# Every Ask answer works across plants

## Why

The warehouse holds actuals for every SAP plant (31 in July 2026), and the MIS statement already
renders any single plant (decision 0036). Ask does not: GL-code answers read only DUB, because
`actual_by_gl_month` hard-codes `'DUB'`, yet their "How this was calculated" scope lists every
plant the reader holds, so a DUB-only figure reads as company-wide. Plant is neither a filter nor
a breakdown, so "for CHIR" or "Actual by plant" cannot be answered. Every statement question from
a reader with more than one plant is refused with "Your statement plant scope is missing or
ambiguous". Budget exists only for DUB (decision 0034), and Ask shows ₹0 for every other plant,
so lines can read "over budget" when no budget was ever loaded. Decision 0037 deferred the
plant-aware assistant to a follow-up; this is that follow-up. The owner asked on 2026-10-04 that
every Ask answer can work across plants.

## Users

- Finance readers and admins who hold several plants (the seeded admin holds every plant) and ask
  about one plant, a few, or all of them.
- Readers who hold exactly one plant, who must see no change beyond honest budget labels.

## Behaviour

### Choosing the plants

- A question that names one or more plants ("for DUB", "for DUB and CHIR", "at Krishna") is
  answered for those plants. A plant is recognised by its canonical code, its SAP code or its
  display name from the mapping master (e.g. "DUB", "DUB-NUR", "Agri - Nursery - DUB"). A named
  plant the reader does not hold is refused, naming it, and no data for it is read.
- A question that names no plant, from a reader holding more than one plant, is answered with a
  plant picker instead of data. The picker lists the reader's plants by display name and adds
  "All plants". Choosing one or several plants, or "All plants", runs the question for that set,
  following the typed-choice pattern Ask already uses for the statement period (decision 0033).
  A reader holding exactly one plant gets that plant without a picker.
- "All plants" means every plant the reader holds, not every plant in the warehouse.
- The answer always says which plants it covers: one plant by name, a few by name, or "All plants
  (n)". The "How this was calculated" scope lists the plants the query read, not the reader's
  whole grant list.

### Plant as a filter and a breakdown

- Plant is a filter (one or several plants) and a breakdown (one row per plant) in both Ask
  domains: GL-code answers and statement-line answers. "Actual by plant for July 2026" returns one
  row per plant in the chosen set. "Compare DUB and CHIR" breaks down by plant over those two.
- Rows that break down by plant show the plant's display name, keyed by its canonical code.
- Without a plant breakdown, rows sum across the chosen plants: a GL code's Actual for "All plants"
  is the sum over every chosen plant.

### GL-code answers

- GL-code answers read actuals for every chosen plant; the governed GL relation stops being DUB-only.
- The DUB answer to "Which GL codes had Actual over Budget in July 2026 for DUB?" stays exactly what it
  is today (21 GL codes, 50001201 at ₹83,98,339).

### Statement answers

- A statement question for one plant behaves as today.
- A statement question for several plants, or "All plants", returns one combined statement: each
  statement line sums its Actual across the chosen plants, using each plant's own mapping (the
  plant's triples from the mapping master). Lines no chosen plant maps to show ₹0 Actual; the
  unmapped-GL line (decision 0018) sums every chosen plant's unmapped triples.
- A combined statement's department and function readout says it spans the chosen plants; it does
  not pick one plant's labels.

### Budget and %

- Budget belongs to the budget owner plant, DUB (decision 0034). For any other plant Ask shows
  Budget as a dash labelled "Budget not loaded for this plant" and no %, never ₹0, matching the
  MIS screen (decision 0036). Comparisons that need a budget (e.g. Actual over Budget) exclude rows
  whose budget is not loaded, and the answer says how many plants had no budget.
- A row covering several plants shows Budget and % only when every plant in it has a loaded budget.
  Otherwise it shows the dash with "Budget loaded for k of n plants", and no %.
- A plant breakdown shows each plant's own Budget, or the dash.

### Names, transactions and links

- GL names, statement labels and clicking an Actual (story ASK-GL-NAMES-AND-TRANSACTIONS) work for
  any plant set. The signed drill context binds the exact plant set the query read, so a click opens
  only those plants' transactions, adding up to the clicked Actual. A per-plant row opens only that
  plant's transactions.
- "View in report" stays available only for a single-plant statement answer; a multi-plant answer
  says it cannot open one statement.
- Saved views and pins keep the chosen plant set, and a re-run uses it, re-checked against the
  reader's current grants.

### What does not change

- Readers with one plant see the same answers, apart from honest budget labels.
- The MIS statement screen and its export are unchanged.
- No new data is loaded, and no budget for a plant other than DUB.

## Rules

- No figure is fabricated: every number traces to warehouse rows for the plants named in the answer.
- The model selects plants only from the governed plant vocabulary the reader holds; it never
  authors SQL.
- A plant the reader does not hold is never read, named in a total, or offered in the picker.
- Nothing about other plants' figures reaches the model beyond what it needs to select (names and
  codes of the reader's plants).

## Success measure

- Metric: share of the seeded admin's Ask questions on the July data (the three suggested questions
  plus "Actual by plant for July 2026" and a statement question for two plants) that end in an
  answer, after choosing plants when none is named, rather than a plant-scope refusal.
- Baseline: 1 of 5 today. The GL question answers for DUB only; the statement questions are refused;
  "by plant" cannot be answered.
- Target: 5 of 5, with zero "plant scope is missing or ambiguous" refusals for readers who hold plants.
- Check date: 2026-10-20

## Out of scope (now)

- Loading budgets for plants other than DUB, and the five-month data (parked until 3F confirms
  plant coding).
- A combined statement on the MIS statement screen or in its Excel export.
- Department or function as Ask filters, and a section dimension.
- Taking the plant from the docked report's scope (decision 0035's grounding path).

## Acceptance criteria

- **C1 Picker.** A reader holding several plants who names no plant gets a plant picker listing their
  plants by display name plus "All plants", and no data is read until they choose. A reader holding
  one plant gets the answer directly.
- **C2 Named plants.** Plants named in the question by canonical code, SAP code or display name select
  those plants. A named plant outside the reader's grants is refused, named in the refusal, and not
  read.
- **C3 Filter and breakdown.** Plant works as a filter and a breakdown in GL-code and statement-line
  answers. "Actual by plant for July 2026" returns one row per chosen plant, labelled by display
  name.
- **C4 GL answers across plants.** GL-code answers sum actuals over the chosen plants. For DUB alone,
  "Which GL codes had Actual over Budget in July 2026 for DUB?" still returns the same 21 codes, with
  50001201 at ₹83,98,339.
- **C5 Combined statement.** A statement question for several plants returns one statement whose
  lines sum each plant's mapped Actual, with unmapped-GL summed across them. For one plant it equals
  that plant's MIS statement line by line.
- **C6 Budget.** Plants other than DUB show Budget as a "Budget not loaded for this plant" dash with no
  %. A multi-plant row shows Budget only when every plant in it has one; otherwise the dash reads
  "Budget loaded for k of n plants". Budget comparisons skip rows without a loaded budget and say
  how many were skipped.
- **C7 Scope readout.** Every answer states its plant set (a name, names, or "All plants (n)"), and the
  provenance scope lists exactly the plants read.
- **C8 Links and transactions.** GL names, statement labels and transaction drills work for any plant
  set. A drill opens only the plants the answer read and adds up to the clicked Actual. "View in
  report" is available only for single-plant statement answers.
- **C9 Saved and pinned.** A saved view or pin keeps its plant set, and re-runs it against the reader's
  current grants, refusing plants no longer held.
- **C10 Model boundary.** Only the reader's plant names and codes reach the model; no figures do.
- **C11 Live check.** On the July data, as the seeded admin:
  - "Which GL codes had Actual over Budget in July 2026?" shows the picker; choosing DUB returns the 21
    codes.
  - "Actual by plant for July 2026" with "All plants" returns one row per plant, summing to the
    warehouse's July total for those plants.
  - "MIS statement Actual by line for July 2026 for DUB and CHIR" returns one combined statement
    whose lines equal the sum of the two plants' MIS statements.
  - CHIR's Budget shows the not-loaded dash.

## Open items (non-blocking)

- Whether the budget owner rule changes when a second plant's budget arrives (decision 0034's trigger).

## Source

- Owner request, 2026-10-04: "Let's first fix multiplant answers. All the ask should have capability
  to answer multiplant." Choices made the same day: when no plant is named, ask with a plant picker
  that includes "All plants"; plant as a filter and a breakdown; a combined statement for several
  plants; "Budget not loaded" instead of ₹0.
- Decisions 0033, 0034, 0035, 0036 and 0037; `docs/specs/all-plants-statement.md`.

## Roadmap
- ASK-MULTI-PLANT: Every Ask answer works across plants
