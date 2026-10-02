---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-02T16:50:54+00:00
read_hash: 7b4f1b6a48937eb0d08d75c2781898fae7d27b83
round: 9
passed: no
doc_seen: 7b4f1b6a48937eb0d08d75c2781898fae7d27b83
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
notes_seen: e8a3bb8604b8f2e288bbd6a33c41ec006f8347ad
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. **Gap: C3/C4 do not define which Ask result shapes can drill.**
   - Ask can group by both GL and month, apply filters, or return statement leaf keys; then a cell’s Actual need not equal the answer-wide period total. Define supported selections and re-derive the exact row predicate server-side from the executed selection, row identity, scope, period, and pinned batches.
   - A GL code is not a unique statement leaf: the existing mapping deliberately splits some GLs across cost centres and leaves. The statement-line path therefore needs a pinned outline/leaf identity, not just a raw key.
   Disposition: cut Behaviour now limits clicks to answers whose only row dimension is gl_code or leaf_key, has the server re-derive the predicate from the re-authorized selection, and routes statement lines through the pinned outline's leaf identity (C3, C4).

2. **Contradiction: “same panel and columns the statement drill uses” conflicts with “the MIS statement screen and its drill” do not change.**
   - The current statement drill has Month, posting date, debit, credit, value, reference, and memo. C3 instead requires posting date, document number, cost centre, account name, memo, reference, debit, credit, and value.
   - Choose one shared transaction-panel contract and update both callers, or explicitly allow an Ask-specific panel. Also settle replaced batches: the current statement UI withholds rows after replacement, while C6 requires the replaced batch to be read and named.
   Disposition: cut one shared transaction panel with document number, cost centre and account name, the statement drill gains them additively, and replaced or gone batches behave exactly as the statement drill does today (Behaviour, C4, C6).

3. **Gap: the naming query’s predicate and tie semantics are not sufficiently pinned.**
   - Define “most often” as a count of transaction rows, scoped to the answer’s actual batches, period, and authorized plants; specify normalization and ordering for the full-name list.
   - A budget-only GL can occur under more than one active-outline label, so “the MIS statement line label” is not necessarily singular. Define the selection/tie rule or the display for multiple labels.
   Disposition: cut 'most used' is a row count over the answer's pinned batches, period and authorized plants, names compared trimmed and case-insensitively with alphabetical ties, and multiple outline labels show the first in outline order with '+n more' (Behaviour, Names).

4. **Contradiction: a budget-only row can display an Actual of zero but C3 makes every GL Actual a button.**
   - Specify that an Actual is interactive only when the row has contributing SAP transactions; a budget-only/empty Actual is inert and creates neither a raw read nor an audit event. Preserve clicking a genuine zero-net Actual that does have transactions.
   Disposition: cut the server marks an Actual clickable only when at least one SAP line feeds it; zero-net with lines stays clickable; budget-only Actuals are inert with no read or audit (Behaviour, C7).

5. **Gap: the hover-only disclosure is not usable on keyboard and touch devices.**
   - Require a focusable/tappable disclosure or equivalent accessible name containing the complete ordered list, and prove that “+n more” is announced without relying on a `title` tooltip.
   Disposition: cut '+n more' is a focusable, tappable disclosure and the accessible name carries the full ordered list; nothing depends on a hover tooltip (Behaviour, C7).

6. **Trap: no network in CI and fresh Ask conversations: C8.**
   - Mark C8 as a manual/live warehouse check, not a CI test, and require the quoted question in a fresh Ask conversation. Add hermetic proofs for name selection, fallback, pin/refusal/audit ordering, replacement/gone outcomes, inactive cells, and exact-paise footing.
   Disposition: cut C8 lists the hermetic proofs and marks the live check manual, outside CI, in a fresh Ask conversation.

## Round 2

7. **Gap: the “answer identity” needed for a tamper-proof drill is undefined.**
   - Ask responses currently expose no durable answer/turn identifier that a drill endpoint can resolve to the original selection, effective scope, row amounts, and provenance; a session ID is not that identity.
   - Specify a user-bound, opaque attestation or a server-owned answer record, its lifetime and refusal when missing/expired/deleted. The server must never accept a client-supplied selection, scope, or row amount as a substitute.
   Disposition: cut supported answers carry a signed, user-bound, expiring drill context built like the statement attestation; the server refuses missing, altered, expired or other-user contexts with an audit record and never takes selection, scope, batches or amounts from the client (Behaviour, C5a).

8. **Contradiction: “authorized plants” is not necessarily the plant predicate that fed a GL answer.**
   - `governed-financial` currently aggregates from `actual_by_gl_month`, which is DUB-only. A reader authorized for DUB plus other plants could receive a DUB-only Actual while the proposed raw predicate reads that GL from every authorized plant, leaking rows and breaking the footer.
   - Require the drill and name resolver to use the effective plant predicate of the executed governed query, and prove a mixed-scope user cannot add another plant’s transactions or names.
   Disposition: cut names and the drill use the raw lines the executed governed query aggregated, under its effective plant predicate, never every authorized plant; a mixed-plant proof is required (Behaviour, C1, C5a, C8).

9. **Contradiction: C1/C2 still say “active” batches/outlines while Behaviour requires the answer’s pinned batches and outline.**
   - Resolve names against the pinned provenance, including statement-line labels, or an answer reopened after a re-upload can display a current outline label for an old leaf/result.
   - C1/C2 and their hermetic proofs should explicitly cover replacement and a pinned outline that differs from the active one.
   Disposition: cut C1 and C2 now resolve against the answer's pinned batches and outline, including after a re-upload, with hermetic proof (C1, C2, C8).

10. **Gap: C6 does not state what an Ask reader sees for replaced and gone batches.**
   - The current statement panel tells the reader to “Generate the statement again,” which is wrong in Ask; it currently withholds replaced-batch rows as well.
   - Specify the Ask copy and whether a replaced pinned batch displays its rows/footer or the unavailable state, then prove both outcomes.
   Disposition: cut Ask shows no rows and states the reload in its own words for a replaced or gone batch; the statement screen is unchanged (Behaviour, C6).

## Round 3

11. **Contradiction: C3 still permits the unsafe “authorized plants” predicate.**
   - Behaviour and C5a correctly require the effective plant predicate of the executed query, but C3 still specifies “authorized plants.”
   - Replace that term in C3 and its proof with the effective executed predicate; otherwise the acceptance test can approve the mixed-scope leak and footing failure already identified.
   Disposition: cut C3 now names the effective plant predicate of the executed query.

12. **Gap: the signed Ask context does not bind the expected Actual or per-row clickability.**
   - The existing statement attestation protects `nodeAmounts` by digest while the client supplies those amounts for verification. This spec forbids the client from sending an amount and does not say the new context contains signed Actual paise and feeding-line presence for each row.
   - Bind those values in the signed context, or use a server-owned result record, so the server can enforce the exact-paise footer and the client has a trusted clickable/inert marker without accepting client data.
   Disposition: cut the signed context carries each row's key, exact-paise Actual and feeding-line marker, and the footer target comes from it (Behaviour, C3, C5a).

13. **Gap: pinned budget-outline replacement and disappearance have no Ask outcome.**
   - Statement-line drills need the pinned budget outline to resolve a leaf to its triples. C6 covers only actuals batches, despite the existing drill treating a replaced budget batch as a distinct pin status.
   - Specify the replaced and gone outcomes for the pinned budget batch, including rows, user copy, and audit behaviour; add them to C8.
   Disposition: cut the pinned budget batch on statement lines follows the same replaced and gone outcomes, rows, copy and audit as the actuals batches (Behaviour, C6, C8).

14. **Contradiction: C6 conflicts with the confirmed transaction-drill behaviour for a replaced batch.**
   - `actuals-drill-down` requires an existing but replaced pinned batch to be read, foot to the displayed Actual, and report replacement; only a gone batch is refused. C6 instead withholds all Ask rows for both.
   - Resolve this against the confirmed spec before approval; an Ask-specific departure needs an explicit decision rather than silently changing the pinned-read guarantee.
   Disposition: cut Ask now follows the confirmed actuals-drill-down spec: a replaced batch is read, foots and is named; only a gone batch is refused (Behaviour, C6).

## Round 4

15. **Gap: a signed context must not substitute for current RBAC re-authorization.**
   - The context freezes the effective plant predicate at answer time, but the spec never requires every click to re-check the reader’s current grants and plant scope.
   - If scope changes during the 30-minute lifetime, refuse the drill rather than intersecting the old predicate and returning a partial, non-footing result. Add a proof for scope revoked after the answer was rendered.
   Disposition: cut every click re-authorizes current grants and plant scope and refuses, audited, when access changed, never narrowing to a partial read (Behaviour, C5c, C8).

16. **Gap: the Ask response and reopened-turn contract do not define how drill context is delivered or retained.**
   - Current `AskResponse` and `ConversationAnswerSnapshot` have no drill-context or per-row drill metadata. “Carries a signed drill context” does not pin its response field, row association, or expired-context behaviour after a page/conversation reopen.
   - Define the contract and require a re-run to mint a fresh context when it is absent or expired; prove a hydrated old answer cannot issue a drill with stale or missing metadata.
   Disposition: cut AskResponse gains optional drillContext and per-row drillable, not stored in snapshots, saved views or pins; expired or stored answers refuse with stated wording and saved or pinned reopens re-run for a fresh context (Behaviour, C5b, C8).

## Round 5

17. **Gap: `drillable` cannot be added directly to a current result row without changing the generic table contract.**
   - `ResultTable.rows` permits only string, number, or null values; a boolean violates that type. Adding it as a table column would also render an unintended column.
   - Define typed drill metadata outside the generic rows, keyed by row index/key, and prove it remains absent from non-drillable answer shapes.
   Disposition: cut drill metadata is a typed drill object outside ResultTable (signed context plus rows of key and drillable), absent on unsupported shapes, with proof (Behaviour, C5b, C8).

18. **Contradiction: partial plant-scope revocation is not refused.**
   - The text refuses only when the reader loses “every plant” in the signed predicate. If an answer covered plants A and B and access to B is revoked, the reader still has A; retaining the original predicate leaks B, while narrowing it violates the no-partial-footer rule.
   - Require refusal when access to any plant in the signed predicate is lost, with a hermetic partial-revocation proof.
   Disposition: cut losing any one plant in the signed predicate refuses the drill, with a partial-revocation proof (Behaviour, C5c, C8).

19. **Contradiction: stored conversation answers cannot both be clickable and preserve inert rows.**
   - C5b excludes both `drillContext` and `drillable` from the stored snapshot, yet says a stored answer’s click is refused. Without the marker, the UI cannot distinguish a genuine zero-net Actual from a budget-only Actual; making every stored Actual clickable violates C7.
   - Specify that stored answers render all Actuals inert with an “Ask again” affordance, or retain a non-authoritative eligibility marker solely for rendering while the server still refuses absent context.
   Disposition: cut a stored conversation answer renders every Actual inert with an 'Ask again' action that re-runs it, so no marker is stored and no budget-only Actual becomes clickable (Behaviour, C5b, C8).

## Round 6

20. **Security gap: the drill context can disclose Actuals for an answer that did not show them.**
   - Supported shape is defined only by its row dimension, so a Budget-only or %-only GL/leaf answer may receive a context containing every row’s exact Actual. The referenced statement attestation is HMAC-signed, not encrypted; its base64 payload is readable by the client.
   - Issue `drill` only when the corresponding Actual measure was selected and authorized, and make the context genuinely opaque (encrypted or server-held) if it contains amounts. Add a hermetic Budget-only/no-Actual-permission proof that no drill metadata or Actual values are returned.
   Disposition: cut the drill object is issued only when the answer displays an authorized Actual, and the signed context holds only values the answer already displays; Budget-only and no-grant proofs added (Behaviour, C5b, C8).

## Round 7

No findings.

## Round 8

21. Contradiction: C4 requires a historical mapping-master version to be resolvable, despite the confirmed drill contract deferring master-version pins.
   - The accepted all-plants decision defers that work to D-0038; the confirmed drill spec treats the version as audit attribution only. Bound triples already reproduce the read, so either record a new decision that supplies version retention/resolution, or remove the new refusal.
   Disposition: cut every refusal tied to the mapping master's version is removed; the bound triples reproduce the read and the version is audit attribution only, as in the confirmed drill spec.

22. Gap: C1/C2 do not define how server-resolved display names retain the raw row key needed for drilling.
   - `ResultTable` has only scalar cells, while `drill.rows` is keyed by the raw GL/leaf key. Replacing a dimension cell with its display label loses that key; leaving it unchanged cannot display the name. Pin presentation metadata and its row association, and prove labels neither alter query rows nor misassociate a drill.
   Disposition: cut names travel as a typed rowLabels list keyed by the raw row key; ResultTable cells keep the key and drill.rows match by the same key; labels never alter rows or order, with proof.

23. Gap: the Ask paging contract omits the shared drill’s upper page bound and deterministic transaction ordering.
   - C5a only requires an integer from 1, whereas the confirmed drill bounds pages and sorts by Value, Month, posting date, transaction number and line id. Pin the same bound and order for Ask, including tests for an excessive page and stable page boundaries.
   Disposition: cut paging follows the confirmed drill spec exactly: 1-based, size fixed at 100, out-of-range or non-integer page is a 400, sorted Value, Month, posting date, transaction number, line id; excessive-page and page-boundary proofs added.

24. Gap: C1 does not define the displayed canonical form when SAP account names differ only by whitespace or casing.
   - Trimmed, case-insensitive comparison leaves `Sprout Cost`, ` sprout cost ` and `SPROUT COST` without a specified grouping, displayed spelling, or `+n more` count. Define that normalization and add it to the name-selection proof.
   Disposition: cut names group by a trimmed, whitespace-collapsed, case-folded form showing the most frequent spelling; counts and '+n more' are per group; added to the name-selection proof.

## Round 9

25. Contradiction: C2’s reopened-answer label guarantee conflicts with C5b forbidding `rowLabels` in conversation snapshots.
   - A rehydrated conversation retains only raw dimension cells, so after re-upload it cannot render the pinned statement label or GL name. Persist non-sensitive labels for stored answers, or explicitly narrow C1/C2; add a stored-conversation-after-reupload proof.
   Disposition: cut rowLabels are stored in the conversation answer snapshot as non-sensitive display text from the pinned data, so stored answers keep their labels after a re-upload; the drill object is never stored; proof added (C2, C5b, C8).

26. Gap: “out-of-range” page remains undefined.
   - C5a requires a 400 and C8 tests an excessive page, but neither sets the upper bound. Pin the shared drill’s limit (currently one million) so backend, Swagger and the hermetic test agree.
   Disposition: cut the page bound is the shared drill's limit: pages 1 to 1,000,000, anything else or a non-integer is a 400 (Behaviour, C5a, C8).

27. Unproven: C7’s rule that names and transaction lines never reach the model has no named hermetic proof.
   - C8 proves display, drill and access behavior, but not the provider payload boundary. Add a proof that `rowLabels`, account names, drill context, amounts and transaction rows are absent from every model request.
   Disposition: cut C8 adds a hermetic proof that rowLabels, SAP account names, the drill context, amounts and transaction rows are absent from every model request.

