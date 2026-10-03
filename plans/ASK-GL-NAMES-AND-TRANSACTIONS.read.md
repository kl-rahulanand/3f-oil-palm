---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-03T10:20:04+00:00
read_hash: ad201eb56d395f0c2b6999514f4a5021eef97f7c
round: 8
passed: yes
doc_seen: ad201eb56d395f0c2b6999514f4a5021eef97f7c
spec_seen: ebc6473926090ed5ec1a4a7466cbf186cf3f9b4c
notes_seen: a603fecb0fbed88eadbd2069def2934a8eea3014
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. Task ownership and ordering are incomplete around the shared Ask response contract.
   `GL-NAMES` must add `AskResponse.rowLabels` and the snapshot field in `contract/src/api.ts`, but that file is absent from its Scope. Its `After: GL-DRILL-ROUTE` is otherwise only a shared-file dependency. Put both response metadata types in the first route task, or add a small contract seam task. Likewise, `GL-DRILL-ISSUE` depends on `GL-NAMES` only because both edit `chat.service.ts`; it should follow the route task, or a final response-assembly task should own that shared line.
   Disposition: cut GL-DRILL-ROUTE now pins every Ask response type (rowLabels, drill, snapshot field) in the contract; GL-NAMES no longer edits the chat service, and a single GL-ANSWER-WIRING part owns chat.service.ts after both (Tasks).

2. Split: `GL-DRILL-ROUTE` → transaction-line/statement-drill column propagation; signed Ask context and route.
   Its roughly 20-file scope combines the new signing and authorization path with repository changes and the existing statement drill’s contract, DTO, service, Swagger, and tests. It also delivers part of Done-when 4 while its Covers cell names only 3, 6, and 7. A separate shared transaction-line task can own `txnNo`, `costCenter`, and `accountName`; the Ask-route task can then focus on signed-context verification, pin binding, auditing, and paging.
   Disposition: cut the transaction-line columns are their own first part, GL-TXN-COLUMNS, delivering the new Done-when 5; GL-DRILL-ROUTE keeps the signed context, route, pins, audit and paging (Tasks, Done-when 5).

3. Gap: actual-only statement answers with no last-month budget batch have no specified statement-line label.
   Done-when 2 requires every statement row to show its number and name from that batch’s outline, while detail 6 explicitly permits an absent budget pin for an actual-only statement answer. Specify the fallback and add a leaf proving it; a raw leaf key would conflict with Done-when 2.
   Disposition: cut an actual-only statement answer with no last-month budget batch labels lines from the leaf key ('1.1 Sprout cost'), never raw, with a leaf (detail 2).

4. Gap: the plan does not preserve an exact-paise source for the signed Actual.
   The warehouse adapter converts numeric cells to JavaScript `number`, and `SelectionExecutor` exposes only `ResultTable` numbers. `GL-DRILL-ISSUE` therefore has no exact decimal value to sign for arbitrary `numeric(18,2)` amounts. Pin an internal fixed-scale/paise carrier before number coercion, add its producing files to Scope, and test cent values and footing.
   Disposition: cut the exact-paise rule is pinned: Math.round(actual * 100) stored as an integer string, rows beyond the safe-integer bound are not drillable, with cent-value leaves (detail 7).

5. Unproven: item 3: a non-integer page is rejected with HTTP 400.
   The detail requires this, but its named leaves include only an excessive page. Add the non-integer route/schema assertion to `ask-drill.service.test.ts` or a controller-level test.
   Disposition: cut a non-integer page (400) leaf is added (detail 3).

6. Unproven: item 6: a valid context paired with a different or unlisted row key, and a reader who loses the domain grant.
   The context binds per-row keys and re-authorization includes domain access, but the listed leaves cover altered signatures, Actual-grant loss, and plant loss only. Both cases need refusal-audit-before-read assertions.
   Disposition: cut leaves for a row key the context does not list and for a lost domain grant are added, refusal audited before any read (detail 7).

7. Unproven: item 7: a gone pinned budget batch on a statement-row drill.
   The plan proves replaced budget and gone actuals, but not the required gone-budget refusal: no rows, stated message, and refusal audit.
   Disposition: cut a gone budget batch on a statement row is added to the pin leaves (detail 8).

## Round 2

8. Gap: `Math.round(actual * 100)` cannot guarantee the signed Actual is exact paise.
   The executor has already converted `numeric(18,2)` to a JavaScript number; at sufficiently large values, cents are lost before rounding, while the new cutoff also makes an Actual with SAP lines inert. Preserve a fixed-scale decimal/paise value before number coercion instead of declining otherwise drillable rows.
   Disposition: cut the signed Actual comes from a grouped count and sum(value)::text query over each row's drill predicate, an exact decimal string signed as integer paise that is also the click's footer; no JavaScript number and no cutoff (detail 7, GL-ANSWER-WIRING).

9. Unproven: item 3: a non-integer page returns HTTP 400.
   The prose states the rule, but detail 3’s test leaves still name only an excessive page. The prior finding’s claimed non-integer test leaf was not added.
   Disposition: cut the non-integer page (400) leaf is now in detail 3 (the round 1 edit had missed its target).

10. Gap: the new leaf-key label fallback is not in the confirmed spec.
   The spec requires statement labels from the last-month budget outline; it does not authorize deriving and title-casing a label from a raw leaf key. Confirm and record this variant in the spec, or remove it.
   Disposition: cut the leaf-key label fallback is removed; Done-when 2 now covers statement answers built on budget data, and an answer with no pinned outline keeps today's raw key, as the spec's pinned-outline rule implies (Done-when 2, detail 2).

## Round 3

11. Trap: stale leaf-key fallback: `GL-NAMES` still promises a “leaf-key fallback,” while detail 2 now requires raw leaf keys when no budget batch exists.
   Remove that phrase from the task, or the task and its tests can reintroduce the rejected derived-label behavior.
   Disposition: cut the GL-NAMES row now says raw leaf keys are kept when there is no outline; no derived-label wording remains.

12. Gap: no task can register the new GL-name repository for the chat-service wiring.
   `GL-NAMES` creates `GlNameRepository`, but neither it nor `GL-ANSWER-WIRING` scopes `backend/src/chat/chat.module.ts`; the latter is the only task that injects it into `ChatService`. Add the module wiring and a Nest-resolution proof to the wiring task.
   Disposition: cut GL-ANSWER-WIRING scopes backend/src/chat/chat.module.ts, registers the name resolver and adds a Nest-resolution leaf.

13. Gap: the exact issuance aggregate is not pinned to the route footer’s implementation.
   `sap_transaction` has debit and credit, not a `value` column; the existing drill footer derives value as `debit - credit`. Define one repository summary operation using that exact expression, then have both issuance and the route footer use it, with a test proving their decimal strings match.
   Disposition: cut one repository operation, summarize, returns count and sum(debit - credit)::text, the existing footer's expression; issuance signs it and a leaf proves issuance and route footer strings match (detail 7).

## Round 4

No findings.

## Round 5

14. Gap: stored-conversation handling contradicts the confirmed spec.
   The plan says no screen reopens stored conversations and proves only the snapshot service boundary, but C5b requires a reopened stored answer to make every Actual inert and offer “Ask again.” No task or frontend test delivers that behavior, nor is it deferred in the confirmed spec.
   Disposition: cut GL-DRILL-PANEL now renders every Actual of an answer with no `drill` object (every stored snapshot) inert with an "Ask again" action, with a leaf on a snapshot-shaped answer; no screen reopens stored conversations today because the conversations module is not mounted.

15. Unproven: item 2: a multi-period answer selects labels from its last-month budget batch and outline.
   Detail 2 states the rule, but its leaves cover only active-outline replacement, absent budget batch, and snapshot storage. Add this case to `gl-name.repository.test.ts`.
   Disposition: cut GL-ANSWER-WIRING chooses the batch the resolver uses, so it proves a multi-period answer passes its last month's budget batch to the name resolver; the resolver's own leaf already covers the pinned last-month outline.

16. Unproven: item 6: a %-only answer has no `drill` object and cannot issue a transaction request.
   The plan proves Budget-only and unauthorized-Actual cases, but not the separately specified %-only case. Add an issuance and inert-cell assertion.
   Disposition: cut GL-ANSWER-WIRING proves a %-only answer carries no `drill`; GL-DRILL-PANEL proves its cells are inert and make no request.

17. Unproven: item 7: a missing signed context is refused, audited, and read-free.
   The route leaves name invalid signatures, expiry, and another user, but not an absent context, which the confirmed spec explicitly requires to receive a stated, audited refusal.
   Disposition: cut GL-ANSWER-WIRING scopes the Ask drill controller and service and proves a request with no context is refused like a tampered link, audited, and starts no read (detail 7).

## Round 6

18. Gap: the stored-answer “Ask again” action cannot be limited to stored answers.
   `drill` is absent for both stored snapshots and ordinary unsupported live answers. Rendering “Ask again” for every answer without `drill` makes unsupported live Actuals interactive, contrary to item 6’s inert/plain cells. Add an explicit stored-answer source marker or pass that state separately.
   Disposition: cut GL-DRILL-PANEL takes an explicit stored-answer flag from its caller; only a flagged answer shows "Ask again", and a leaf proves a live answer without `drill` keeps plain inert cells.

19. Gap: bounded `otherLabels` cannot meet the confirmed full-disclosure requirement.
   `hiddenOtherLabelCount` reports labels the client does not receive, so it cannot reveal the complete ordered list or put it in the accessible name. Keep the complete list in `rowLabels`, or add a specified, authorized retrieval path.
   Disposition: cut `otherLabels` now carries every other normalized name in order and the count field is gone, so the disclosure and accessible name show the complete list as the confirmed spec requires.

20. Split: `GL-NAMES` → name/outline resolution and response-contract wiring.
   Its expanded 16-file scope now re-edits the route task’s contract, chat schema, Swagger, and transaction repository, while also changing ingestion parsing and frontend rendering. The route task should own the shared response contract and route files; keep the name resolver, snapshot, and display work together.
   Disposition: keep GL-NAMES is built and through review; with finding 19 it no longer touches the contract, chat schema or Swagger files, and its remaining shared edits are a pure export of the drill predicate and the outline identity rule so the resolver copies neither.

21. Gap: the no-context route proof is owned by the wrong task.
   `GL-ANSWER-WIRING` now scopes `ask-drill.controller.ts`, `ask-drill.service.ts`, and its test solely for a route refusal that `GL-DRILL-ROUTE` already owns. Put that leaf in `GL-DRILL-ROUTE` and remove the shared route scope from the wiring task.
   Disposition: keep GL-DRILL-ROUTE merged as PR 88 and cannot take new work, so the no-context refusal leaf stays with GL-ANSWER-WIRING, the next part to run, and its route scope is limited to that refusal.

## Round 7

22. Disputed keep 20: the remaining shared export is not pinned by the earlier route task.
   `buildPredicate` is currently module-private, while the plan says `GL-NAMES` will rely on an export from the drill repository without naming its signature or a cross-consumer proof. Pin that public predicate seam and its test in `GL-DRILL-ROUTE`, or specify the independent name-query predicate in `GL-NAMES`.
   Disposition: cut GL-NAMES now names the seam: it exports the existing builder as `buildDrillPredicate(predicate: DrillPredicate)` with no behaviour change, and a leaf proves the drill and the resolver render the identical predicate.

23. Trap: stale merged-task description.
   The disposition says `GL-DRILL-ROUTE` has merged, but detail 3 and its task row still describe a new route and its pre-issuance state as work to deliver. Sweep the builder section for the merged state before later parts merge.
   Disposition: cut the GL-TXN-COLUMNS and GL-DRILL-ROUTE rows are marked merged with their PR numbers, and a note says their rows and detail 3 describe delivered work.

24. Gap: task coverage no longer matches delivered behavior.
   `GL-ANSWER-WIRING` now implements and tests an item 7 refusal, but covers only 6 and 9; `GL-DRILL-PANEL` implements item 6’s inert-cell rules, but covers only 4 and 10. Add those Done-when items to the respective Covers cells.
   Disposition: cut GL-ANSWER-WIRING now covers 6, 7 and 9; GL-DRILL-PANEL covers 4, 6 and 10.

## Round 8

No findings.
