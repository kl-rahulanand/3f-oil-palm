# Ask names each GL line and opens its transactions

5 parts · Risks: none one-way · New moving parts: a transaction route for Ask answers and its signed answer link

## What changes for you

An Ask answer by GL code shows what each code is: "50001201 · Sprout Cost - Imp" instead of a bare
number, with "+14 more" where a code covers several SAP account names. An answer by statement line
shows "1.1 Sprout Cost" instead of a raw key. Clicking a line's Actual opens the SAP transactions
behind that exact number, in the same panel the MIS statement uses, adding up to the figure you
clicked. The statement screen's transaction panel also gains three columns: document number, cost
centre and account name.

## Why

Bare GL codes mean nothing without a chart of accounts open alongside, and checking what a figure is
made of meant leaving Ask for the statement screen. The owner asked on 2026-10-02 for names and for a
click to show the transactions, and confirmed the spec `docs/specs/ask-gl-names-and-transactions.md`.

## Done when

1. **An Ask answer by GL code shows each code with its main SAP account name, a "+n more" list for codes with several names that works by keyboard and touch, the MIS line name for budget-only codes, and the bare code when no name exists, without changing any row, total or order.**
2. **An Ask answer by statement line that was built on budget data shows each line's number and name from that data instead of a raw key.**
3. **Clicking a GL line's Actual opens the SAP transactions behind it for exactly that answer's period and plants, a hundred at a time, adding up to the clicked figure to the paisa.**
4. **Clicking a statement line's Actual in Ask opens the same transactions the statement screen opens for that line.**
5. **The transaction panel, on the statement screen and in Ask, shows each line's document number, cost centre and account name.**
6. **Only answers that show an Actual the reader may see offer a click, and only on Actuals with transactions behind them; Budget, %, totals and budget-only lines stay inert and cause no read.**
7. **Every opening is recorded before any transaction is read; a tampered, expired or someone else's answer link, or a reader whose access has changed, is refused with a stated reason and recorded, never served a partial result.**
8. **Reloaded data behaves as the statement drill does: a replaced batch is still read and named as replaced, and a removed batch is refused with a reason.**
9. **Names, the answer link, amounts and transactions never reach the assistant's model.**
10. **A live check on the July data shows names for all 21 over-budget GL codes, opens 50001201's Actual to lines adding up to ₹83,98,339, and opens a DUB-only user's statement line to the same lines as the statement screen.**

## Risks

- **Signed answer link.** The link is signed, not encrypted, so it must hold only figures the answer
  already shows; the wiring part proves a Budget-only answer and a reader without the Actual grant get no
  link and no Actual value.
- **Plant scope.** The GL view reads only the plants its governed relation aggregates (today
  `actual_by_gl_month` is DUB-only), while the statement drill reads every plant the reader holds.
  The Ask drill must use the plants the answer's query actually read, or the footer stops matching
  and other plants' lines leak; the route part proves a reader with more plants sees no extra lines.
- **Nothing one-way:** no migration, no data deletion, no new vendor.

## For the builders

### Done-when details

1. (spec C1, C7 disclosure) The name is the most frequent SAP `acct_name`, by count of `sap_transaction`
   rows among the lines the executed query aggregated into that row: its pinned actuals batches, its
   time window and its effective plant predicate (for governed-financial, the plants of the governed
   relation intersected with the reader's scope, today {DUB} ∩ scope; never every plant the reader
   holds). Names group by a trimmed, whitespace-collapsed, case-folded form; each group shows its most
   frequent original spelling (ties: alphabetical); "+n more" counts groups. Budget-only codes take the
   label of the outline belonging to the answer window's last-month budget batch (several labels: the
   first in outline order, "+n more"); with no such batch or label, the bare code. Names travel in an
   optional typed `AskResponse.rowLabels` list of `{ key, label, otherLabels }`
   keyed by the raw row key; `otherLabels` holds every other normalized name in order, never a cut
   list, so the disclosure and the accessible name show the complete list. `ResultTable` cells keep the raw key; labels never alter rows, totals or order. The "+n more"
   is a focusable, tappable disclosure and the line's accessible name includes the full ordered list.
   Leaves: name selection and ties, normalization, multi-name count, budget-only fallback, bare code,
   mixed-plant reader sees only the query's plants' names, rows/order unchanged, disclosure keyboard
   and accessible name.
2. (spec C2, C5b labels) The statement-line label is "<s_no> <label>" from the outline of the answer
   window's last-month budget batch (`StatementOutlineRepository.findByBudgetBatchId`), never the
   active outline. An actual-only statement answer with no last-month budget batch has no pinned
   outline, so its lines keep today's raw leaf key (the spec defines labels only from the pinned
   outline; nothing is derived from the key). `rowLabels` is stored in the conversation answer snapshot (`answerSnapshot()`
   whitelist, `conversations.service.ts:248`); the drill object never is. The app has no screen that
   reopens a stored conversation (owner deferral, 2026-10-02) and no production writer calls
   `appendTurn`, so stored-answer behaviour is proven at the service boundary. Leaves: labels from the
   pinned outline after another outline becomes active; raw keys kept when there is no budget batch;
   snapshot keeps `rowLabels` and drops `drill`.
3. (spec C3, C5a paging) A new `POST /api/chat/drill` takes the signed context, the row key and a page
   (1 to 1,000,000; anything else or a non-integer is a 400, as `mis-drill.dto.ts:30`). For a
   governed-financial row the predicate is the row's GL code, the time window, the selection's
   dimension filters, the effective plant predicate bound in the context and the pinned actuals
   batches; `DrillTransactionsRepository.buildPredicate` gains a GL-and-plants mode alongside its
   triples mode. Sort is the existing `value DESC, month DESC, posting_date DESC, txn_no, line_id`;
   page size 100; the response carries page, size, total count and an all-match footer. The footer
   equals the row's signed Actual to the paisa. Leaves: predicate re-derivation per row, footer equals
   the signed Actual, excessive page, non-integer page (400), stable page boundary, empty result.
4. (spec C4) For a mis-statement row the context binds the exact plant, cost-centre and GL triples
   the executed query resolved (`MasterResolvedSelection.leafTargets`, `chat.service.ts:470-479`) and
   the mapping master's version (audit attribution only); the route reads exactly those triples and
   the single plant the statement scope resolved. GL-DRILL-ROUTE's leaf proves the Ask read equals the
   statement drill's read for the same leaf, period and batches; GL-DRILL-PANEL proves a click on a
   statement line's Actual opens that read.
5. (spec C4 columns) `MisDrillLine` and the Ask drill line gain `txnNo` (the document number,
   `sap_transaction.txn_no`), `costCenter` and `accountName`; the repository selects them; the
   statement drill DTO passes them through; the shared panel shows them on both screens (additive:
   no existing column changes). Leaves: repository columns, statement drill response, panel columns.
6. (spec C5b, C7) `AskResponse.drill` (`{ context, rows: [{ key, drillable }] }`, outside
   `ResultTable`) is issued only when the only row dimension is `gl_code` (governed-financial) or
   `leaf_key` (mis-statement) AND the displayed measures include that domain's Actual
   (`governed-financial.actual`, `mis-statement.actual_net`) the reader may see. `drillable` is true
   only when at least one SAP line feeds the row under its predicate (a genuine zero net with lines
   stays true). The frontend renders only `drillable` Actuals as buttons; Budget, `%`, totals,
   budget-only Actuals and empty-state rows are plain text and never call the route. Leaves: no
   `drill` for a month breakdown, a no-breakdown answer, a Budget-only answer and a reader without
   the Actual grant; `drillable` false for budget-only and true for zero-net-with-lines; inert cells
   make no request.
7. (spec C5, C5a, C5c) The context is signed like `StatementAttestationService` (same secrets env,
   same TTL env, default 30 minutes) by a sibling service with its own claims: user id, executed
   selection, effective plant predicate, pinned actuals batches, the last-month budget batch and its
   outline digest when present (absent is allowed: an actual-only statement answer may have no budget
   batch, and the read then uses the bound triples alone), for statement rows the bound triples and
   mapping version, and per row the key, the Actual in exact paise and `drillable`. Exact paise: the
   signed Actual never passes through a JavaScript number. `DrillTransactionsRepository` gains one
   summary operation, `summarize(predicates)`, returning per row key the feeding-line count and
   `sum(txn.debit - txn.credit)::text` (the same value expression the existing footer uses; there is
   no `value` column), an exact `numeric(18,2)` decimal string. GL-ANSWER-WIRING calls it at issuance
   and signs the string as integer paise; GL-DRILL-ROUTE's footer is computed by the same operation's
   expression, and a leaf proves the issuance string and the route footer string are identical for
   the same predicate. The
   row is drillable when its count is at least one; issuance also checks that this exact sum equals
   the displayed Actual to the paisa and logs a data mismatch (and marks the row not drillable)
   otherwise. Leaves include cent values (₹0.01, ₹12,345.67), a sum above ₹90 lakh crore, and the
   footing. Every click:
   verify signature, expiry and user; re-authorize the reader's current domain, Actual measure and
   plant scope, refusing if any one plant in the bound predicate is no longer held; then write the
   typed drill audit record (reuse `writeDrillEvent` with an Ask question label) before any read, and
   fail closed with 503 when that write fails; refusals write `writeDrillRefusalEvent`. Wording:
   "This answer is too old to open. Ask again to open its transactions." (expired),
   "Your access has changed since this answer was shown. Ask again." (access). Leaves: invalid
   signature, expired, other user, lost one of two plants, lost Actual grant, audit-before-read
   ordering, audit failure 503, a reader with more plants than the query read sees no extra lines,
   a valid context with a row key it does not list, a reader who lost the domain grant, and a request
   with no context at all, which reaches the service, is refused like a tampered link and audited, and starts no read.
8. (spec C6) Pin binding follows `MisDrillService.bindPins`: a replaced pinned batch (actuals, or on
   statement lines the budget) is read, foots to the clicked Actual and the panel says "This answer
   was built on data that has since been reloaded; these are the lines it was built from."; a gone
   pinned batch is refused with no rows, "The data behind this answer is no longer available. Ask
   again to open its transactions." and a refusal audit record. Leaves: replaced actuals, replaced
   budget on a statement row, gone actuals, gone budget on a statement row.
9. (spec C7 boundary) Extend `chat.service.test.ts:68` ("the llm provider receives the question prior
   turns and dimension values and never an amount or a result row") so `rowLabels`, SAP account names,
   the drill context, amounts and transaction rows are proven absent from every provider request.
10. (spec C8 live) Manual live check, outside CI, against the July warehouse and the host's Bedrock
   model, each question in a fresh conversation, recorded in the last commit's `Functional check:`
   paragraph: as the admin, "show me list items where Actuals are more than the budget for July 2026"
   shows names for all 21 codes and 50001201's Actual opens to lines footing to ₹83,98,339; as a
   DUB-only user, a statement-line answer's Actual opens to the same lines as the statement screen's
   drill for that line; the statement screen's panel shows the three new columns.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| GL-TXN-COLUMNS | Document number, cost centre and account name in the transaction panel (merged, PR 87) | The repository selects `txn_no`, `cost_center` and `acct_name`; `MisDrillLine` gains `txnNo`, `costCenter`, `accountName`; the statement drill DTO and service pass them through; the statement screen's panel shows the three columns. Pins the transaction-line shape the Ask route reuses. | 5 | `contract/src/api.ts`, `backend/src/warehouse/drill-transactions.repository.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts`, `backend/src/warehouse/drill-transactions.interface.ts`, `backend/src/mis/mis-drill.dto.ts`, `backend/src/mis/mis-drill.service.ts`, `backend/src/mis/mis-drill.service.test.ts`, `frontend/src/features/mis/drill-panel.tsx`, `frontend/src/features/mis/drill-panel.test.tsx` | `backend/src/warehouse/drill-transactions.repository.test.ts`, `backend/src/mis/mis-drill.service.test.ts`, `frontend/src/features/mis/drill-panel.test.tsx` | none | yes |
| GL-DRILL-ROUTE | The signed answer link and the Ask transaction route (merged, PR 88) | Pins the Ask response seam in the contract (`AskResponse.rowLabels`, `AskResponse.drill`, the Ask drill request and response, `rowLabels` on the conversation snapshot type) and the backend read: the sibling signing service with its claims and exact-paise rule, the `POST /api/chat/drill` controller and service (verify, re-authorize, audit before read, predicate re-derivation in a new GL-and-plants mode and the triples mode, pin binding, paging), the chat DTOs and Swagger, the route and Swagger registries. One crossing leaf: a context issued by the signing service for a fixture answer opens through the route and foots to its signed Actual. No Ask answer issues a context yet and no frontend change. | 3, 7, 8 | `contract/src/api.ts`, `backend/src/chat/ask-drill-context.ts`, `backend/src/chat/ask-drill-context.test.ts`, `backend/src/chat/ask-drill.controller.ts`, `backend/src/chat/ask-drill.service.ts`, `backend/src/chat/ask-drill.service.test.ts`, `backend/src/chat/chat.module.ts`, `backend/src/chat/chat.schemas.ts`, `backend/src/warehouse/drill-transactions.repository.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts`, `backend/src/warehouse/drill-transactions.interface.ts`, `backend/src/core/audit.service.ts`, `backend/src/app.routes.test.ts`, `backend/src/swagger.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | `backend/src/chat/ask-drill-context.test.ts`, `backend/src/chat/ask-drill.service.test.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts`, `backend/src/app.routes.test.ts`, `backend/src/swagger.test.ts`, `tools/quality-gate.test.mjs` | GL-TXN-COLUMNS | no |
| GL-NAMES | The name resolver, the snapshot field and the label rendering | The name resolver over `sap_transaction` under the executed query's scope with normalization, ties and budget-only fallback, and statement labels from the pinned last-month outline (raw leaf keys kept when there is none); `rowLabels` kept in the conversation snapshot whitelist; the Ask table renders "key · label" with the "+n more" disclosure from `rowLabels`. It exports the drill repository's existing predicate builder as `buildDrillPredicate(predicate: DrillPredicate)` with no behaviour change, and a leaf proves the drill and the name resolver render the identical predicate for the same scope. The chat service wiring is GL-ANSWER-WIRING's. | 1, 2 | `backend/src/ingest/mis-budget.parser.ts`, `backend/src/ingest/mis-format-outline.ts`, `backend/src/warehouse/gl-name.repository.ts`, `backend/src/warehouse/gl-name.repository.test.ts`, `backend/src/warehouse/drill-transactions.repository.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts`, `backend/src/conversations/conversations.service.ts`, `backend/src/conversations/conversations.service.test.ts`, `backend/src/conversations/conversations.service.db.test.ts`, `frontend/src/features/assistant/ask-panel.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx`, `backend/package.json`, `tools/quality-gate.test.mjs` | `backend/src/warehouse/gl-name.repository.test.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts`, `backend/src/conversations/conversations.service.test.ts`, `backend/src/conversations/conversations.service.db.test.ts`, `frontend/src/features/assistant/ask-panel.test.tsx`, `tools/quality-gate.test.mjs` | GL-DRILL-ROUTE | yes |
| GL-ANSWER-WIRING | Ask answers carry names, the signed link and clickable markers | The only part that edits the chat service: it attaches `rowLabels` from the name resolver and issues `AskResponse.drill` only for supported shapes that display an authorized Actual, with per-row `drillable` and the exact signed Actual from the drill repository's `summarize` operation (count and `sum(debit - credit)::text`), and registers the name resolver in the chat module with a Nest-resolution leaf, the bound plant predicate, batches, the last-month budget batch when present, and statement triples; the model-boundary leaf extended; a multi-period answer passes its last month's budget batch to the name resolver, a %-only answer carries no `drill`, and the route refuses, audits and does not read on a request with no context (detail 7). | 6, 7, 9 | `backend/src/chat/chat.service.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/chat.module.ts`, `backend/src/chat/ask-drill.controller.ts`, `backend/src/chat/ask-drill.service.ts`, `backend/src/chat/ask-drill.service.test.ts`, `backend/src/warehouse/drill-transactions.repository.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts` | `backend/src/chat/chat.service.test.ts`, `backend/src/chat/ask-drill.service.test.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts` | GL-NAMES | no |
| GL-DRILL-PANEL | Click an Actual, see its transactions | The shared transaction panel opens from an Ask answer's `drillable` Actuals (GL and statement lines), calls the Ask route with context, row key and page, and shows the replaced and refusal wording; inert cells make no request. Budget and % cells, and every Actual of an answer with no `drill` object, are plain inert cells; the panel takes an explicit stored-answer flag from its caller, and only a stored answer shows an "Ask again" action on its Actuals (spec C5b; no screen reopens stored conversations today because the conversations module is not mounted, so a leaf drives the panel with the flag set on a snapshot-shaped answer, and another proves a live answer without `drill` stays plain). The live functional check. | 4, 6, 10 | `frontend/src/features/mis/drill-panel.tsx`, `frontend/src/features/mis/drill-panel.test.tsx`, `frontend/src/features/assistant/ask-panel.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/lib/api.ts` | `frontend/src/features/mis/drill-panel.test.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx` | GL-ANSWER-WIRING | yes |
New moving parts: the `POST /api/chat/drill` route (Done-when 3, 4, 7) and the Ask drill signing service, a sibling of the statement attestation on the same secrets (Done-when 7).

## Notes

- GL-TXN-COLUMNS (PR 87) and GL-DRILL-ROUTE (PR 88) have merged; their rows and detail 3 describe delivered work, and later parts build on it rather than redo it.
- Spec `docs/specs/ask-gl-names-and-transactions.md`, confirmed by Rahul Anand on 2026-10-02 (round 10).
- Owner decisions, 2026-10-02: SAP name (most used, "+n more", MIS label fallback); only Actual opens
  transactions; both the GL-code and statement-line views; the statement panel gains three columns.
- Carried from the spec fix's final review (non-blocking): labels and drill rows are keyed by the raw
  row key, which is unique in the supported shapes (one row per `gl_code` or `leaf_key`); an
  actual-only statement answer may have no last-month budget batch, so the context allows an absent
  budget pin and the read uses the bound triples alone (Done-when detail 6).
- Known traps (AGENTS.md) applied: every new test file's task lists `backend/package.json` and
  `tools/quality-gate.test.mjs`; no `.prettierignore`-listed file is in any Scope; workers run
  `npm run quality` before their last commit; the live check asks each question in a fresh
  conversation. No tool-schema or prompt change, so no model probe is needed.
- The live check's DUB-only user is `dub@example.invalid` with role admin and plants DUB (the analyst
  role lacks the `report` action), seeded by `npm run db:migrate` with `SEED_USERS`; the mock code is
  in `backend/src/email/email.service.ts`.
