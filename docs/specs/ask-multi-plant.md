---
slug: ask-multi-plant
title: Every Ask answer works across plants
status: draft
saved: 2026-10-04T08:45:07+00:00
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

### What counts as a read

- A **figure read** is any warehouse query that returns amounts or lines: the answer's data query, its
  totals, GL names, drill summaries and transactions. It is audited as today (the execution record is
  written before the query).
- A **metadata lookup** returns no amount: the mapping master, the reader's grants, the selector's cached
  distinct GL-code and month values, and load-batch metadata (which batches are active and which months
  they cover). It is not audited as a data read, exactly as these lookups are not today.
- Wherever this spec says "no read" or "nothing is read", it means no figure read; metadata lookups may
  run.

### The plant set an answer uses

- An answer's plants are carried as one existing `SelectionFilter` in the selection:
  `{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }`. The values are canonical plant codes,
  deduplicated and sorted. There is no second filter grammar. Every selection that runs a data query holds
  exactly one plant filter. One with none, including an edited selection or a saved view or pin made before
  this change, gets the plant picker if the reader holds several plants, or a singleton filter of their one
  plant if they hold one.
  Any other plant filter (`eq`, `neq`, a non-array value, an empty array, an unknown code) is refused as
  invalid. Every value is also checked against the reader's current grants: a known plant they do not
  hold refuses the whole selection as `plant-not-granted`, naming it, with no read. A filter is never
  intersected down to the granted part. This validation and canonicalisation runs at every ingress: a new
  Ask question, a typed-choice continuation, an edited selection, a saved view, a pin and their re-runs.
  A submitted filter value must already be a canonical code, compared exactly. A SAP code, a display name
  or a different case (`dub`, `DUB-NUR`, "Agri - Nursery - DUB") in a filter is refused as
  `plant-filter-invalid`; alias resolution applies only to plant names in question text.
- The model chooses plants only from a vocabulary of the reader's granted plants: each plant's
  canonical code and display name. For a new question, the plants the server resolves from the question
  text are authoritative. They set the plant filter, replacing whatever the selector emitted, and a
  difference is logged. When the question names no plant, any plant filter the selector emits is
  discarded and the picker rule applies. An edited selection's plant filter is authoritative once
  validated. The server, before any warehouse read, resolves every named plant
  to its canonical code through the mapping master. It matches the canonical code, the SAP code or
  the display name, ignoring case and surrounding or repeated whitespace (e.g. "dub", "DUB-NUR",
  "Agri - Nursery - DUB" all mean DUB). Loading the mapping master rejects any alias that collides with
  another plant's alias after this normalisation, so the load fails before any resolver, model or
  warehouse path uses it.
- A named plant the reader does not hold is refused, naming it, with no warehouse read and a refusal
  audit record. So that its name never reaches the model, the server checks the question before the
  selector is called. Any whole-word match on a canonical code, SAP code or display name of a mapping
  master plant the reader does not hold refuses the question with no provider call. Codes shorter than
  three characters match only as an exact upper-case token, so ordinary words are not mistaken for plants:
  "CK" names the plant CK, while "ck" names no plant and is treated like any other word, for granted and
  ungranted plants alike. Every other code, SAP code and display name matches case-insensitively.
- A plant is recognised only by that whole-word match against the mapping master. No other word is ever
  treated as a plant, so a question whose words match no plant is treated as naming none and gets the
  picker rule, with no "not recognised" notice. Period, measure and GL words ("July", "Actual", "GL") never
  match a plant.
- "All plants" stores the exact canonical set of plants the reader held when they chose it. It is a
  snapshot, not a live rule: a saved view does not silently grow when new plants are granted.

### Choosing the plants

- A question that names one or more plants is answered for those plants.
- A reader who holds no plant gets no picker. Any data question is refused as `no-plants-granted` with
  "You do not have access to any plant.", audited as a refusal, with no provider call and no read.
- A question that names no plant, from a reader holding more than one plant, is answered with a typed
  plant picker instead of data. No figure is read before a choice: no data query, totals, names, drill
  summary. The selector's existing cached lookup of distinct GL-code and month values,
  which reads no figure, may run first, as it does before today's period choice; plant values never come
  from it (owner decision, 2026-10-04). A reader holding exactly one
  plant gets that plant without a picker. The picker is `AskResponse.plantChoice`:
  `{ prompt, question, selection, options: [{ value: <canonical code>, label: <display name> }],
  allPlants: { label: "All plants", value: [<every granted canonical code, sorted>] } }`.
  - `selection` is the base selection without a plant filter.
  - The client requires at least one plant. With none chosen, the picker stays open with the message
    "Choose at least one plant", announced to assistive technology, and nothing is sent.
  - The client allows several options or "All plants", and submits the original `question` with
    `selection` plus the plant filter set to the chosen codes (or `allPlants.value`), through the same
    edited-selection path the period choice uses.
  - The server re-validates that filter like any other ingress. The contract, the request and response
    schemas and Swagger all carry the type.
- When a question needs both a plant and a statement period, the plant is chosen first, then the
  period. Each continuation carries the full base selection plus every choice made so far. On each
  continuation the server re-checks the reader's current grants. If a chosen plant is no longer held,
  or the selection no longer validates, the continuation is refused with its reason and nothing is
  read.
- A successful data answer always says which plants it covers: one plant by name, up to three by name,
  or "n plants" with the names in the "How this was calculated" scope. That scope lists exactly the
  plants the query read, not the reader's whole grant list.
- Pickers, refusals and informational answers have no plant set and carry no plant readout.
  - The picker's prompt is "Which plants should this answer cover?".
  - An ungranted plant is refused with "You do not have access to <name>."

### Plant as a filter and a breakdown

- Governed-financial (GL-code) answers accept `plant` as a dimension alongside `gl_code` and `month`,
  in any combination: "Actual by plant for July 2026" (plant), "Actual by GL code and plant"
  (gl_code × plant).
- Statement answers accept `leaf_key` alone, or `leaf_key × plant`. A statement answer split by plant
  has one row per statement line per plant, keyed `<leaf_key>|<plant>`, ordered by statement order and
  then by plant display name. A plant-total question with no statement lines ("Actual by plant") is a
  governed-financial question.
- Rows that carry a plant show its display name and are keyed by its canonical code.
- Every row has one row key, derived by one shared function from the result table's row: the row's
  grouping cells in a fixed order (`gl_code` or `leaf_key`, then `month` as `YYYY-MM-01`, then `plant` as
  its canonical code), joined with `|`, using only the cells the answer groups by. So `gl_code` alone gives
  `50001201`, a plant breakdown `50001201|CHIR`, a plant-only answer `CHIR`, and a month-and-plant answer
  `2026-07-01|CHIR`. The key is unique per row for every allowed shape. `rowLabels`, `budgetStates` and
  `drill.rows` are all keyed by it, and the client looks them up through the same function, so the same
  GL code, line, plant or month in two rows never shares a name entry, budget state or drill link.
- Names and clicks apply only to the answer shapes whose row identity is exact: `gl_code`,
  `gl_code × plant`, `leaf_key` and `leaf_key × plant`. Any shape with `month` or another dimension renders
  plain values with no names and no clickable Actual, as today.
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

- Budget belongs to the budget owner plant, DUB (decision 0034). A plant has a loaded budget for a row
  when it is the budget owner and every month the row covers has an active budget batch: the row's own
  month when the answer groups by month, otherwise every month of the answer's window. An answer with no
  time window takes as its window every month covered by an active Actual load batch, determined from
  the load batches before the query runs (and so before any comparison filtering). A month with no
  active budget batch makes DUB count as not loaded for that row, as the statement screen treats a
  period with no budget batch.
- When an answer includes Budget or %, each row carries a typed budget state, `AskResponse.budgetStates`,
  keyed by row key:
  `{ key, state: "loaded" | "not-loaded" | "partial", plantsWithBudget, plantsInRow }`.
  - `plantsInRow` is the row's plants within the answer's plant set, as canonical codes, sorted: its one
    plant for a row split by plant, and every chosen plant for a summed row, whether or not that plant
    had any activity. `plantsWithBudget` is the subset with a loaded budget, sorted the same way.
  - `loaded`: every plant in the row has a loaded budget. Budget and % show as today, including a real
    ₹0 budget.
  - `not-loaded`: no plant in the row has one. Budget shows a dash labelled "Budget not loaded for this
    plant" (or "...for these plants"). The % column stays, with a null cell labelled "not loaded".
  - `partial`: some do. Budget shows a dash labelled "Budget loaded for k of n plants", and the % cell is
    null with the same label. A partial row never shows a budget figure that would compare part of its
    Actual.
- These rules apply only to the measures the answer shows; no measure is added. An answer with neither
  Budget nor % (e.g. "Actual by GL code for CHIR") adds no Budget or % column and carries no
  `budgetStates`. The Budget dash applies to a shown Budget column and the "not loaded" % cell to a shown
  % column.
- The dashes and labels are rendered from the typed state, each label also the cell's accessible name.
  The result table's Budget and % cells are null for not-loaded and partial rows. No column is ever
  dropped, as `docs/specs/all-plants-statement.md` requires.
- Actual and Budget are joined at the grain of plant, GL code and month (for statements, plant, line and
  month) before any aggregation across plants. The budget carries its owner plant and joins only that
  plant's actual rows, so a DUB+CHIR row never pairs CHIR's Actual with DUB's budget, and no budget or
  provenance crosses plants.
- A comparison that needs a budget (e.g. Actual over Budget) reads only the chosen plants that have a
  loaded budget for every month of the answer's window, whatever the grouping. A plant missing a budget
  batch for any month of the window is left out whole, never compared on some months only.
- The answer's `selection` keeps the plants the reader asked for (e.g. DUB and CHIR), because that is
  what a saved view or pin stores and re-runs; only the effective query predicate, totals, provenance
  and drill context use the compared plants (DUB). A re-run recomputes which plants have a budget, so if
  DUB was left out for a month with no budget batch and that batch is later loaded, the re-run compares
  DUB. Only DUB can have a budget in this scope (decision 0034). That restriction is in the query itself, before grouping, ordering, the row limit,
  totals and drill preparation. Every row of such an answer is therefore `loaded`, and its totals cover
  exactly the plants compared. When at least one chosen plant was left out, the answer carries a typed
  `AskResponse.leftOut: { reason:
  "budget-not-loaded", plants: [<display names>] }`, rendered as "Left out because Budget is not loaded:
  <names>". This is an explanation of what was not compared, separate from the plant readout, which names
  only the plants read. When no plant was left out (e.g. DUB alone), `leftOut` is omitted and no
  left-out copy renders, so DUB-only comparisons look as they do today.
- When no chosen plant has a budget, nothing is read. The answer is `responseClass` Informational with
  the same `leftOut` and the copy "Budget is not loaded for any chosen plant, so nothing was compared." It
  carries no result table, no provenance, no plant readout, no `budgetStates` and no drill context, and
  `viewInReport` is `{ available: false, reason: "Budget is not loaded for any chosen plant." }`.

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

- Saved views and pins keep the canonical plant set. Their lists already mark a card not runnable with a
  reason and a message, and disable reopening it. A revoked plant joins that path: the status gains the
  reason `plants_revoked` with the message "This view includes plants you no longer have access to:
  <names>. Edit its plants to run it.", and the card is disabled as for `grant_revoked`.
- A re-run that reaches the server anyway (a stale list, a direct request) re-checks the plants and is
  refused as the Ask answer `plants-revoked` above, audited as a refusal, and no subset is run.

### Refusals

- Every plant refusal of an Ask request is an Ask answer, not an HTTP exception, so the global exception
  filter cannot strip its wording. Each is `responseClass` BlockedByPolicy with a typed
  `refusal: { reason, plants }`, and the client renders the copy from the reason:

  | reason | when | `plants` | copy |
  |---|---|---|---|
  | `plant-not-granted` | a named or submitted plant the reader does not hold | display names of those plants | "You do not have access to <names>." |
  | `plants-revoked` | a saved view or pin re-run whose plant is no longer held | display names of the revoked plants | "This view includes plants you no longer have access to: <names>. Edit its plants to run it." |
  | `choice-plants-revoked` | a picker or period continuation whose chosen plant is no longer held | display names of the revoked plants | "You no longer have access to <names>. Ask again." |
  | `plant-filter-invalid` | a malformed, empty, non-canonical or unknown filter | `[]` | "This question's plant choice is not valid. Choose the plants again." |
  | `no-plants-granted` | the reader holds no plant | `[]` | "You do not have access to any plant." |

  Client leaves render each row's copy from its reason.
- The request's origin decides which reason a no-longer-held plant gets. It is a new optional
  `AskRequest.origin: "plant-choice" | "period-choice" | "saved-view" | "pin"`, set by the client when it
  submits a picker or period choice or reopens a saved view or pinned card through the selection path.
  `reportGrounding` (a docked MIS report) is not an origin. `origin` only selects the refusal wording and
  never widens access.
- Checks run in a fixed order, and the first that applies decides:
  1. `no-plants-granted`;
  2. `plant-filter-invalid`;
  3. a plant the reader does not hold: `plants-revoked` for `origin` `saved-view` or `pin`,
     `choice-plants-revoked` for a request whose `origin` is a choice, otherwise `plant-not-granted` (including
     the pre-selector name check).
  So a reader with no plant who names CHIR is refused as `no-plants-granted`, with no provider call and no
  read.
- The contract carries every new value as a typed union, with matching request and response schemas and
  Swagger: `AskResponse.refusal.reason` (`plant-not-granted`, `plant-filter-invalid`, `plants-revoked`,
  `choice-plants-revoked`, `no-plants-granted`), `AskResponse.leftOut.reason` (`budget-not-loaded`),
  `AskRequest.origin`, the HTTP `error.details.reason` union (adding `plant-filter-invalid` and
  `plant-not-granted` to the measure-filter reasons), and the saved-view and pin status reason (adding
  `plants_revoked` to `grant_revoked` and `definition_unregistered`).
- Saving a view or pinning a report is not an Ask request. A save or pin whose plant filter is invalid or
  holds a plant the reader does not hold is rejected with HTTP 400 through the existing typed path the
  global exception filter already uses for measure filters: a typed plant-filter error whose reason
  (`plant-filter-invalid` or `plant-not-granted`) maps to the same copy as the table above in
  `error.userMessage`, with `error.details.reason` set. The save and pin dialogs render that
  `userMessage`.

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
  4. "Actual, Budget and % by GL code for July 2026 for CHIR". Expected: CHIR's GL rows, with a
     Budget dash labelled "Budget not loaded for this plant" and a null % cell labelled "not loaded" in a
     % column that is still present.
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
    plants", and a leaf proves no figure was read before the choice (no data query, totals, names or drill
    summary; distinct values only for the non-plant vocabulary columns).
  - A one-plant reader gets the answer directly.
  - An edited selection, and a saved view or pin made before this change, with no plant filter gets the
    picker (several plants) or a singleton filter (one plant), proven by leaves.
  - For a new question, plants named in it override the selector's plant filter. A selector filter is
    discarded when no plant is named.
  - Plant is chosen before period when both are missing; each continuation carries the full selection and
    re-checks grants.
- **C2 Plant resolution.**
  - Leaves cover the canonical code, the SAP code, the display name, and case and whitespace variants.
  - A recognised but ungranted plant is refused, named and audited, with no selector call and no read.
  - A question whose words match no plant gets the picker rule, with no notice. Leaves prove "July",
    "Actual", "Budget", "GL" and "statement" never match a plant.
  - A short code is not matched inside an ordinary word. "CK" names CK and is refused when ungranted;
    "ck" names no plant and gets the picker rule.
  - An edited selection whose plant filter holds a known plant the reader does not hold is refused whole,
    naming it, with no read and an audit record; one holding an empty array is refused as invalid. Neither
    is narrowed to a partial result.
  - The picker with nothing chosen shows "Choose at least one plant" and sends no request.
  - A submitted filter holding `dub`, `DUB-NUR` or a display name is refused as `plant-filter-invalid` at
    each ingress (edited, continuation, saved, pinned).
  - A mapping master with two plants whose aliases collide after normalisation fails to load.
  - A reader with no plant is refused as `no-plants-granted`, audited, with no provider call and no read,
    including when the question names CHIR (refusal order).
  - A save and a pin request with a tampered plant filter get HTTP 400 with the stated `userMessage` and
    `details.reason`, proven through the global exception filter, separately from an Ask re-run; the
    dialogs render that message.
  - A continuation whose chosen plant was revoked is refused as `choice-plants-revoked` with its copy, and
    a reopened saved view and a reopened pin as `plants-revoked`, each reached through its `origin`; the
    same plant in a request with no origin, or with only `reportGrounding`, is `plant-not-granted`.
  - Every new reason value round-trips through the contract, the schemas and Swagger.
  - The selection always carries one canonical, sorted, deduplicated `{ dimensionId: "plant", op: "in" }`
    filter, validated at every ingress.
  - The `plantChoice` type round-trips through the contract, the schemas and Swagger.
- **C3 Filter and breakdown.**
  - GL-code answers accept plant with gl_code and month in any combination.
  - Statement answers accept leaf_key or leaf_key × plant, keyed `<leaf_key>|<plant>` and ordered by
    statement order then plant name.
  - Rows show plant display names.
- **C4 GL answers across plants.** GL-code answers sum actuals over the chosen plants. For DUB alone, the
  over-budget question returns the same 21 codes, with 50001201 at ₹83,98,339.
- **C5 Combined statement.** A statement question for several plants returns one statement whose lines sum
  each plant's mapped Actual. Named leaves prove:
  - each plant's own triples feed a shared line, with no triple dropped or double-counted;
  - a line no chosen plant maps to reads ₹0;
  - unmapped-GL sums every chosen plant's unmapped triples;
  - for one plant the answer equals that plant's MIS statement line by line.
- **C6 Budget states.**
  - `budgetStates` marks rows loaded, not-loaded or partial. The last two show the Budget dash labels, and
    a null % cell labelled "not loaded" in a % column that is still present.
  - Leaves cover DUB only, non-owner only, a mixed summed row, a mixed plant breakdown, a DUB row with a
    real ₹0 budget (loaded), and a comparison whose remaining rows are empty.
  - A DUB range April–July with no active budget batch for one month: the summed row is `not-loaded`, a
    month-grouped row is loaded only for months with a batch, and a comparison over a DUB period with no
    budget batch is the Informational no-budget answer.
  - At the plant grain, DUB's budget joins only DUB's actual rows: a DUB+CHIR row's budget is DUB's alone
    (and the row is `partial`), and a CHIR row has no budget, for GL and statement answers.
  - Measure sets: Actual only (no Budget or % column, no `budgetStates`), Actual and Budget (Budget dash
    only), % only (the "not loaded" % cell only) and all three (both), each for a CHIR row.
  - A DUB April–July comparison where one month has no budget batch leaves DUB out whole, named in
    `leftOut`, and becomes the Informational no-budget answer when DUB is the only chosen plant.
  - An answer with no time window takes its months from the active Actual load batches before the query
    runs; an Actual month with no DUB budget batch makes the summed DUB row `not-loaded`, and an
    unwindowed DUB-only comparison with such a month is the Informational no-budget answer: the leaf
    proves only metadata lookups ran (load batches, grants, mapping master), with no figure read and no
    execution audit record.
  - A DUB+CHIR summed row where CHIR has no activity is `partial`, with `plantsInRow` `["CHIR","DUB"]` and
    `plantsWithBudget` `["DUB"]`.
  - A budget comparison reads only plants with a loaded budget, applied in the query before ordering, the
    limit and totals. A fixture with more qualifying DUB rows than the row limit, alongside non-owner plants,
    proves no qualifying row is dropped and the totals are exact. The left-out plants are named.
  - A DUB+CHIR budget comparison keeps DUB and CHIR in its `selection`; saved or pinned and re-run, it
    again compares DUB and names CHIR as left out. A saved DUB comparison left out for a month with no
    budget batch compares DUB once that batch is active.
  - A DUB+CHIR budget comparison names CHIR as left out, while its query predicate, totals, drill context
    and "How this was calculated" scope contain DUB only. Naming CHIR in the explanatory copy never adds
    it to the queried scope.
- **C7 Scope readout.**
  - Every successful data answer states its plant set, and the provenance scope lists exactly the plants read.
  - Pickers, refusals and informational answers carry no plant readout, and use the stated copy.
  - A budget comparison for CHIR alone is the Informational no-budget answer with `leftOut` naming CHIR,
    no result table, no provenance, no plant readout, no read and `viewInReport` unavailable with its
    stated reason, even for a statement question. `leftOut` is rendered apart from the plant readout.
  - A DUB-only budget comparison has no `leftOut` and renders no left-out copy.
  - A leaf with a mixed grant, where the reader holds more plants than the answer reads, proves the effective
    plant predicate reaches provenance, GL names, composite drill rows (GL-code × plant and leaf × plant) and
    the transaction footer, and none of them widens to the grant set.
- **C8 Links and transactions.**
  - Names and drills apply only to `gl_code`, `gl_code × plant`, `leaf_key` and `leaf_key × plant`; a shape
    with `month` renders inert, proven by a leaf.
  - Drills work for any plant set with composite row keys. A per-plant row reads only its plant; a summed
    row reads only the chosen set; a combined statement row reads each plant's triples.
  - The row-key function gives a unique key for every allowed shape: `plant` alone, `month` alone,
    `month × plant`, `gl_code × month`, `gl_code × month × plant`, and the four drillable shapes, proven by
    a leaf per shape.
  - One GL code and one statement line each appear for both DUB and CHIR in a plant breakdown. Leaves prove
    each row gets its own name, budget state and drill link through the shared row-key function, and that
    clicking CHIR's row reads only CHIR's lines.
  - Each foots to the clicked Actual to the paisa. A row whose plant set the reader partly lost is refused.
  - "View in report" is available only for single-plant statement answers.
- **C9 Saved and pinned.** A saved view or pin keeps its canonical plant set. Leaves prove that once either
  plant of a DUB+CHIR view or pin is revoked, its list status is `plants_revoked` with the stated message
  and the card is disabled; that a direct re-run is refused as the `plants-revoked` Ask answer, audited and
  not run; and that an "All plants" view does not grow with new grants.
- **C10 Model boundary.** Leaves prove the model receives only the current reader's plant codes and display
  names: no ungranted plant name (the pre-selector check refuses before any provider call), and no figure.
  Plant refusals reach the client as typed `refusal` reasons.
- **C11 Live check.**
  - Before the change, a fixed corpus is probed against the live Bedrock model as the seeded admin, and
    each selection recorded. The corpus and its expected selections:
    - "show me list items where Actuals are more than the budget for July 2026": domain
      `governed-financial`, measures Actual and Budget, dimension `gl_code`, measure filter
      Actual > Budget, period July 2026.
    - "which GL codes spent more than 5 lakh in July 2026": `governed-financial`, measure Actual,
      `gl_code`, measure filter Actual > 500000, July 2026.
    - "Actual by GL code for July 2026": `governed-financial`, measure Actual, `gl_code`, no measure
      filter, July 2026.
    - "which statement lines are over budget for July 2026", as the DUB-only user: domain
      `mis-statement`, measures Actual and Budget, dimension `leaf_key`, measure filter Actual > Budget,
      July 2026.
    The admin's corpus answers carry no plant filter before the change.
  - After it, the five success-measure questions are asked as the seeded admin, each in a fresh
    conversation, with their stated results. The corpus is probed again: each selects the same domain,
    measures, dimensions, measure filter and period as recorded, and the admin's questions now get the plant
    picker first.

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
