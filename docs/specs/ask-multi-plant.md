---
slug: ask-multi-plant
title: Every Ask answer works across plants
status: draft
saved: 2026-10-04T06:55:16+00:00
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

This spec reopens choosing among several plants, which `docs/specs/ask-period-control.md` lists as
out of scope. It supersedes decision 0037 for Ask, and it governs the plant choice. It reuses the
mechanism of the typed period choice that `ask-period-control.md` shipped, not the superseded
decision 0033.

## Users

- Finance readers and admins who hold several plants (the seeded admin holds every plant) and ask
  about one plant, a few, or all of them.
- Readers who hold exactly one plant, who must see no change beyond honest budget labels.

## Behaviour

### The plant set an answer uses

- An answer's plants are carried as one canonical plant filter in the selection:
  `{ attribute: "plant", operator: "in", values: [...] }`. The values are canonical plant codes,
  deduplicated and sorted. There is at most one plant filter; any other plant filter shape is
  refused as invalid.
- The model chooses plants only from a vocabulary of the reader's granted plants: each plant's
  canonical code and display name. The server, before any warehouse read, resolves every named plant
  to its canonical code through the mapping master. It matches the canonical code, the SAP code or
  the display name, ignoring case and surrounding or repeated whitespace (e.g. "dub", "DUB-NUR",
  "Agri - Nursery - DUB" all mean DUB).
- A named plant the reader does not hold is refused, naming it, with no warehouse read and a refusal
  audit record. A name that matches no plant is answered with the plant picker, saying the name was
  not recognised.
- "All plants" stores the exact canonical set of plants the reader held when they chose it. It is a
  snapshot, not a live rule: a saved view does not silently grow when new plants are granted.

### Choosing the plants

- A question that names one or more plants is answered for those plants.
- A question that names no plant, from a reader holding more than one plant, is answered with a typed
  plant picker (`plantChoice`) instead of data. The picker lists the reader's plants by display name,
  allows several to be chosen, and adds "All plants". No warehouse read runs before a choice. A reader
  holding exactly one plant gets that plant without a picker.
- When a question needs both a plant and a statement period, the plant is chosen first, then the
  period. Each continuation carries the full base selection plus every choice made so far. On each
  continuation the server re-checks the reader's current grants. If a chosen plant is no longer held,
  or the selection no longer validates, the continuation is refused with its reason and nothing is
  read.
- The answer always says which plants it covers: one plant by name, up to three by name, or
  "n plants" with the names in the "How this was calculated" scope. That scope lists exactly the
  plants the query read, not the reader's whole grant list.

### Plant as a filter and a breakdown

- Governed-financial (GL-code) answers accept `plant` as a dimension alongside `gl_code` and `month`,
  in any combination: "Actual by plant for July 2026" (plant), "Actual by GL code and plant"
  (gl_code × plant).
- Statement answers accept `leaf_key` alone, or `leaf_key × plant`. A statement answer split by plant
  has one row per statement line per plant, keyed `<leaf_key>|<plant>`, ordered by statement order and
  then by plant display name. A plant-total question with no statement lines ("Actual by plant") is a
  governed-financial question.
- Rows that carry a plant show its display name and are keyed by its canonical code.
- Without a plant dimension, rows sum across the chosen plants: a GL code's Actual for several plants is
  the sum over them.

### GL-code answers

- GL-code answers read actuals for every chosen plant. The governed GL relation stops being DUB-only,
  carries `plant`, and still restricts to the reader's chosen and granted plants.
- For DUB alone, "Which GL codes had Actual over Budget in July 2026 for DUB?" stays exactly what it is
  today: 21 GL codes, with 50001201 at ₹83,98,339.

### Statement answers

- A statement question for one plant behaves as today.
- A statement question for several plants returns one combined statement. Each statement line sums its
  Actual across the chosen plants, using each plant's own triples from the mapping master. Lines no
  chosen plant maps to show ₹0 Actual. The unmapped-GL line (decision 0018) sums every chosen plant's
  unmapped triples.
- A combined statement's readout names its plant set; it does not take one plant's department and
  function labels.

### Budget and %

- Budget belongs to the budget owner plant, DUB (decision 0034). Each answer row carries a typed budget
  state, `AskResponse.budgetStates`, keyed by row key:
  `{ key, state: "loaded" | "not-loaded" | "partial", plantsWithBudget, plantsInRow }`.
  - `loaded`: every plant in the row has a loaded budget. Budget and % show as today, including a real
    ₹0 budget.
  - `not-loaded`: no plant in the row has one. Budget shows a dash labelled "Budget not loaded for this
    plant" (or "...for these plants"), and % is omitted.
  - `partial`: some do. Budget shows a dash labelled "Budget loaded for k of n plants", and % is omitted.
    A partial row never shows a budget figure that would compare part of its Actual.
- The dash and its label are rendered from the typed state, with the label also as the cell's accessible
  name; the result table's Budget cell is null for not-loaded and partial rows.
- A comparison that needs a budget (e.g. Actual over Budget) evaluates only `loaded` rows. Not-loaded and
  partial rows are left out. The answer then says "n lines left out because Budget is not loaded for
  their plants". With a plant breakdown, DUB's rows are loaded and compare; the other plants' rows are
  left out. When nothing remains, the answer says no lines matched, plus the same left-out readout.

### Names, transactions and links

- GL names, statement labels and clicking an Actual (story ASK-GL-NAMES-AND-TRANSACTIONS) work for any
  plant set.
- The signed drill context binds, per row, the row's own plant set: a per-plant row binds its one plant,
  and a summed row binds the chosen set. It also binds the composite row key (`<gl_code>|<plant>`,
  `<leaf_key>|<plant>` or the unsplit key). A click reads only that row's plants (for a statement row,
  each plant's own triples) and adds up to the clicked Actual to the paisa. If the reader has lost any
  plant in that row's set, the click is refused with the existing access-changed wording.
- "View in report" stays available only for a single-plant statement answer. A multi-plant answer says
  it covers several plants and cannot open one statement.

### Saved views and pins

- Saved views and pins keep the canonical plant set. A re-run checks it against the reader's current
  grants. If any stored plant is no longer held, the re-run is refused (BlockedByPolicy) with "This view
  includes plants you no longer have access to: <names>. Edit its plants to run it." It is audited as a
  refusal, and no subset is run.

### What does not change

- Readers with one plant see the same answers, apart from honest budget labels.
- The MIS statement screen and its export are unchanged.
- No new data is loaded, and no budget for a plant other than DUB.

## Rules

- No figure is fabricated: every number traces to warehouse rows for the plants named in the answer.
- The model selects plants only from the reader's granted plant vocabulary (codes and display names);
  it never authors SQL, and no figure reaches it.
- A plant the reader does not hold is never read, totalled, offered in the picker, or sent to the model.
- Adding plant to the selector's vocabulary and schema can shift the live model's output for phrasings
  that work today (AGENTS.md Known traps). The build probes those phrasings against the live model
  before and after the change.

## Success measure

- Metric: of the five questions below, asked by the seeded admin on the July data, each in a fresh
  conversation, how many end in the expected answer (after choosing plants when the picker appears)
  rather than a plant-scope refusal or a DUB-only figure presented as company-wide.
  1. "Which GL codes had Actual over Budget in July 2026?" Expected: the picker; choosing DUB returns 21
     codes, with 50001201 at ₹83,98,339.
  2. "Actual by plant for July 2026" with "All plants". Expected: one row per plant, summing to the
     warehouse's July Actual for those plants.
  3. "What was the Actual for each MIS statement line in July 2026 for DUB and CHIR?" Expected: one
     combined statement whose lines equal the sum of DUB's and CHIR's MIS statements.
  4. "Actual by GL code for July 2026 for CHIR". Expected: CHIR's GL rows, with a Budget dash labelled
     "Budget not loaded for this plant" and no %.
  5. "What was the Actual for each MIS statement line in July 2026?" Expected: the picker, then the
     period if needed; choosing DUB returns DUB's statement lines with labels.
- Baseline: 0 of 5 today. Question 1 answers DUB-only while listing all plants; 2 cannot split by plant;
  3 and 5 are refused; 4 cannot filter by plant.
- Target: 5 of 5, with zero "plant scope is missing or ambiguous" refusals for readers who hold plants.
- Check date: 2026-10-20

## Out of scope (now)

- Loading budgets for plants other than DUB, and the five-month data (parked until 3F confirms its plant
  coding).
- A combined statement on the MIS statement screen or in its Excel export.
- Department or function as Ask filters, and a section dimension.
- Taking the plant from the docked report's scope (decision 0035's grounding path).

## Acceptance criteria

- **C1 Picker.**
  - A reader holding several plants who names no plant gets `plantChoice` listing their plants plus "All
    plants", and a leaf proves no warehouse read ran before the choice.
  - A one-plant reader gets the answer directly.
  - Plant is chosen before period when both are missing; each continuation carries the full selection and
    re-checks grants.
- **C2 Plant resolution.** Leaves cover the canonical code, the SAP code, the display name, case and
  whitespace variants, a recognised but ungranted plant (refused, named, audited, no read), and an
  unknown name (picker with the not-recognised notice). The selection always carries one canonical,
  sorted, deduplicated plant filter.
- **C3 Filter and breakdown.**
  - GL-code answers accept plant with gl_code and month in any combination.
  - Statement answers accept leaf_key or leaf_key × plant, keyed `<leaf_key>|<plant>` and ordered by
    statement order then plant name.
  - Rows show plant display names.
- **C4 GL answers across plants.** GL-code answers sum actuals over the chosen plants. For DUB alone, the
  over-budget question returns the same 21 codes, with 50001201 at ₹83,98,339.
- **C5 Combined statement.** A statement question for several plants returns one statement whose lines sum
  each plant's mapped Actual, with unmapped-GL summed. For one plant it equals that plant's MIS statement
  line by line.
- **C6 Budget states.**
  - `budgetStates` marks rows loaded, not-loaded or partial, with the dash labels and no % for the last two.
  - Leaves cover DUB only, non-owner only, a mixed summed row, a mixed plant breakdown, a DUB row with a
    real ₹0 budget (loaded), and a comparison whose remaining rows are empty.
  - Budget comparisons evaluate only loaded rows and report how many lines were left out.
- **C7 Scope readout.** Every answer states its plant set, and the provenance scope lists exactly the plants
  read.
- **C8 Links and transactions.**
  - Drills work for any plant set with composite row keys. A per-plant row reads only its plant; a summed
    row reads only the chosen set; a combined statement row reads each plant's triples.
  - Each foots to the clicked Actual to the paisa. A row whose plant set the reader partly lost is refused.
  - "View in report" is available only for single-plant statement answers.
- **C9 Saved and pinned.** A saved view or pin keeps its canonical plant set. Leaves prove that a DUB+CHIR
  view is refused, audited and not run once either plant is revoked, and that an "All plants" view does not
  grow with new grants.
- **C10 Model boundary.** Leaves prove the model receives only the current reader's plant codes and display
  names: no ungranted plant, and no figure.
- **C11 Live check.**
  - Before the change, the existing working Ask phrasings are probed against the live Bedrock model and
    recorded.
  - After it, the five success-measure questions are asked as the seeded admin, each in a fresh
    conversation, with their stated results, and the pre-change phrasings still select the same
    dimensions and period.

## Open items (non-blocking)

- Whether the budget-owner rule changes when a second plant's budget arrives (decision 0034's trigger).

## Source

- Owner request, 2026-10-04: "Let's first fix multiplant answers. All the ask should have capability to
  answer multiplant." Choices made the same day: when no plant is named, ask with a plant picker that
  includes "All plants"; plant as a filter and a breakdown; a combined statement for several plants;
  "Budget not loaded" instead of ₹0.
- Decisions 0033, 0034, 0035, 0036 and 0037; `docs/specs/all-plants-statement.md`;
  `docs/specs/ask-period-control.md`.

## Roadmap
- ASK-MULTI-PLANT: Every Ask answer works across plants
