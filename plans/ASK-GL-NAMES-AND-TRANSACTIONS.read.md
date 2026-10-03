---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-03T14:56:27+00:00
read_hash: baf13da941776ce1887d34827426e5cb1a51a3df
round: 28
passed: yes
doc_seen: baf13da941776ce1887d34827426e5cb1a51a3df
spec_seen: 2e29a176a8eb775d49a5c3176efb645277582a9c
notes_seen: 26446d45372e7669cc4ac621be8997eca3a754a5
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

## Round 9

25. Trap: stale merged-task description: GL-NAMES is merged in PR 89, but its row and Notes still present it as pending.
   Update the task state and sweep the builder text for stale descriptions, as required after each merge.
   Disposition: cut the GL-NAMES row is marked merged with PR 89, and the note now lists it with the other merged parts as delivered work.

26. Task coverage is incomplete: GL-ANSWER-WIRING delivers `rowLabels` into live answers but does not cover items 1–2; GL-DRILL-PANEL renders replacement and refusal wording but does not cover items 7–8.
   Add those Done-when items to the respective Covers cells.
   Disposition: cut GL-ANSWER-WIRING now covers 1, 2, 6, 7 and 9; GL-DRILL-PANEL covers 4, 6, 7, 8 and 10.

## Round 10

27. Split: GL-ANSWER-WIRING → label/model-boundary wiring; drill-context issuance and refusal wiring.
   Its Covers cell now has five Done-when items, and its current scope already exceeds the ~400-line limit.
   Disposition: keep GL-ANSWER-WIRING is already built and in review as one change to the chat service; items 1, 2 and 7 are behaviour earlier parts delivered (the name resolver in PR 89, the route refusals in PR 88) that this part only wires into the answer, so splitting it would re-open finished work without separating any risk.

28. Split: GL-DRILL-PANEL → click/inert/refusal interaction; reload-state presentation and live check.
   It now covers five Done-when items; divide the behaviors so each task owns no more than three.
   Disposition: keep GL-DRILL-PANEL is one user flow, click an Actual and see its lines or its stated refusal or replaced-batch wording, proven end to end by one live check; items 7 and 8 are enforced by the merged route and only rendered here, so a split would leave neither half able to prove its items through the running app.

## Round 11

29. Disputed keep 27: the existing resolver and route do not deliver names or a usable signed link until this task wires them into a live Ask response.
   The unmerged task changes nine files and 604 lines. Split label/model-boundary wiring from drill-context issuance and refusal wiring.
   Disposition: cut GL-ANSWER-WIRING now covers 1, 2 and 9 (names into live answers, the resolver registration and the model boundary for names); a new GL-ANSWER-DRILL covers 6, 7 and 9 (link issuance, the no-context refusal and the model boundary for links and amounts), after it.

30. Disputed keep 28: route enforcement alone does not satisfy items 7–8; the panel must render the stated refusal and reload messages.
   It still delivers five items. Split Ask interaction/refusal behavior (4, 6, 7) from reload-state presentation and the live check (8, 10).
   Disposition: cut GL-DRILL-PANEL now covers 4, 6 and 7 (clicks, inert cells, refusal wording, the stored-answer flag); a new GL-RELOAD-AND-LIVE covers 8 and 10 (replaced and gone presentation, then the live check), after it.

## Round 12

31. Contradiction: GL-ANSWER-WIRING says Ask statement questions stay single-month, but the confirmed spec permits supported statement answers with any time window and requires last-month outline selection for multi-period answers.
   Restore multi-period statement periods and name the ChatService leaf that proves their labels, context and drill predicate use the final month’s budget batch.
   Disposition: keep the spec's "any time window" (Supported answers) defines which answers are drillable, not which periods Ask offers for statement questions; offering multi-month statement periods in Ask is not in this story's "What changes for you" or "Done when". Multi-period windows reach issuance through GL-code answers, and GL-ANSWER-WIRING's chat.service leaves prove a multi-month GL answer and the statement label-batch helper both use the final month's budget batch.

32. Shared assembly is unpinned: GL-ANSWER-WIRING and GL-ANSWER-DRILL both own `chat.service.ts` and its test, with their After link only serializing that overlap.
   Assign the combined `rowLabels`/`drill` response assembly to one task, or add a small final assembly task after independent name and drill producers.
   Disposition: keep the After link is how this plan sequences shared files (GL-DRILL-ROUTE then GL-NAMES both edited drill-transactions.repository.ts and merged cleanly): GL-ANSWER-WIRING adds `rowLabels` to the response and merges first; GL-ANSWER-DRILL then adds `drill` to the same assembly on top of it, so each change has one owner at a time.

## Round 13

33. Disputed keep 31: C8 expressly requires a multi-period answer to choose its last-month budget batch and outline, while Supported answers permits any time window for `leaf_key` answers.
   A multi-period GL answer cannot prove the statement-label and bound-triples path. Restore multi-period statement periods and test that path.
   Disposition: cut the multi-period statement path is now proven without changing Ask's period offering: GL-ANSWER-DRILL's issuer leaf binds a multi-period statement selection's final-month budget batch and triples, and GL-ANSWER-WIRING proves a multi-period statement answer reached by re-running a selection (the saved and pinned path) labels from that batch. Offering multi-month statement periods in Ask's own picker is not in this story's approved changes.

34. Disputed keep 32: the stated sequence—one task adds `rowLabels`, the next adds `drill` to the same assembly—is precisely an After link caused only by a shared line.
   Extract independent label and drill producers, then give the response assembly to one final task; otherwise one task must own the shared assembly.
   Disposition: cut GL-ANSWER-DRILL is now an independent producer (`issueAskDrill` in its own file, no chat-service edits) that runs first, and GL-ANSWER-WIRING is the single owner of the response assembly, attaching both `rowLabels` and `drill`.

## Round 14

35. New moving part missing: `ask-drill-issuer.ts` / `issueAskDrill` is a new security-critical producer, but it is absent from New moving parts and has an ambiguous lifecycle.
   The plan calls it an exported function, then says ChatModule registers it. Specify either a pure function with explicit dependencies or an injectable issuer service, add its Nest-resolution proof, and list its Done-when 6–7 purpose.
   Disposition: cut the issuer is now the injectable `AskDrillIssuer` service with explicit constructor dependencies (the drill repository and the Ask drill context signer), listed in New moving parts for Done-when 6 and 7; GL-ANSWER-WIRING registers it in the chat module, with a Nest-resolution leaf proving it resolves from the real module graph.

## Round 15

36. Gap: AskDrillIssuer cannot create the required budget claim with its listed dependencies.
   The signed context requires `{ pin, outlineDigest }`, but the issuer receives only a budget batch and injects only the drill repository and signer. Inject the outline repository and attestation service, or pass a precomputed digest; test the final-month digest in the multi-period statement claim.
   Disposition: cut `AskDrillIssuer` now also injects the pinned statement outline repository and the statement attestation service, builds `{ pin, outlineDigest }` from the final month's budget batch and its outline, and a leaf proves a multi-period statement claim binds that batch, its outline digest and the triples.

## Round 16

37. Task coverage is inconsistent: GL-ANSWER-WIRING attaches `AskResponse.drill` to live answers, but its Covers cell omits items 6 and 7.  
   As with `rowLabels`, the producer alone does not deliver this behavior. Add 6–7 to Covers, or move final drill attachment to the task that owns those items.
   Disposition: cut GL-ANSWER-WIRING now covers 1, 2, 6, 7 and 9: it attaches both `rowLabels` and `drill` to live answers. The decisions behind 6 and 7 (which Actuals may open, the signed amounts, the no-context refusal) are made and proven in GL-ANSWER-DRILL's `AskDrillIssuer` and route leaves; this part proves the answer carries exactly what the issuer returned and that none of it reaches the model.

## Round 17

38. Split: GL-ANSWER-WIRING covers five Done-when items (1, 2, 6, 7, 9).  
   Partition label/model-boundary wiring from drill-response integration so no task claims more than three items.
   Disposition: keep the rules in findings 34 and 37 together fix this: one task must own the response assembly (34), and the task that attaches `rowLabels` and `drill` covers the items they deliver (37), so the assembly owner necessarily covers 1, 2, 6, 7 and 9. Splitting the assembly re-creates 34; moving attachment out re-creates 37. The decisions behind 6 and 7 are made and proven in GL-ANSWER-DRILL, so this part's own risk is the wiring, and it stays whole.

39. Gap: exact summary values cannot prove equality with the displayed Actual at the supported numeric range.  
   `AskDrillIssuer` receives `ResultTable` rows, whose warehouse numeric cells are already JavaScript numbers; preserve a fixed-scale governed-query value for the comparison, and test a cent value beyond safe-number precision.
   Disposition: cut a row is drillable only when `summarize`'s exact paise equal the displayed Actual compared in integer paise; a displayed Actual beyond Number.MAX_SAFE_INTEGER paise is not drillable, so the link fails closed rather than sign an unverifiable amount, and a leaf uses a cent value beyond that range.

40. Simpler: `AskDrillIssuer` → a private/pure ChatService helper with explicit dependencies.  
   The plan states no reuse beyond ChatService and gives no reason an extra injectable provider is needed; this removes a moving part while retaining the issuer tests and security checks.
   Disposition: cut `issueAskDrill(deps, answer)` is a pure helper with explicit dependencies that `ChatService` passes in; it is no longer a provider or a new moving part, and its unit leaves and security checks stay in GL-ANSWER-DRILL.

## Round 18

41. Disputed keep 38: GL-ANSWER-WIRING still covers five Done-when items, despite the explicit three-item task limit.  
   A shared response seam is not an exception to that rule; partition the label and drill integration so each task owns at most three items.
   Disposition: cut following this finding's instruction to partition the label and drill integration: GL-ANSWER-WIRING attaches `rowLabels` and covers 1, 2 and 9; GL-ANSWER-DRILL, after it, adds `drill` to the same response assembly through `issueAskDrill` and covers 6, 7 and 9. Each part owns the assembly in turn, and no part claims more than three items.

42. Contradiction: the new safe-integer cutoff makes a valid Actual with SAP lines inert solely because its displayed number is large.  
   That conflicts with items 3 and 6 and reintroduces the rejected precision limitation. Carry fixed-scale Actual values through the governed-query result for comparison and signing; test that an above-safe-range cent value remains drillable and foots exactly.
   Disposition: cut the safe-integer cutoff and the number comparison are gone: the signed Actual is `summarize`'s exact decimal string in integer paise, `drillable` means `summarize` found lines, and a leaf proves an above-safe-range cent value stays drillable and its route footer equals the signed string exactly. The displayed figure and the drill read the same rows under the same predicate, as GL-DRILL-ROUTE's footing leaf and the July live check prove.

## Round 19

43. Shared assembly is unpinned again: GL-ANSWER-WIRING and GL-ANSWER-DRILL both edit `chat.service.ts`, its test, and `chat.module.ts`; their After link only serializes that overlap.  
   Give one task the response assembly, or introduce an independent seam so the tasks do not take turns editing the same lines.
   Disposition: cut by the owner's decision of 2026-10-03 (Notes), one part, GL-ANSWER-WIRING, owns the whole response assembly, `rowLabels` and `drill` alike, and GL-ANSWER-DRILL is removed, so no two parts edit the assembly.

44. Contradiction: detail 7 requires issuance to verify the exact summary against the displayed Actual and log a mismatch, while GL-ANSWER-DRILL explicitly never compares them.  
   Preserve a fixed-scale, server-only executed-result value for that check; test a mismatch is logged and made inert, including an above-safe-range cent value.
   Disposition: cut issuance compares `summarize`'s exact paise with the displayed Actual's integer paise, logs a data mismatch and leaves the row inert when they differ; by the owner's decision of 2026-10-03 (Notes) a displayed Actual beyond Number.MAX_SAFE_INTEGER paise is not clickable rather than carried at fixed scale through the query engine. Leaves cover a mismatch being logged and inert, and an above-range cent value being inert.

## Round 20

45. Gap: `Number.MAX_SAFE_INTEGER` paise is not a safe two-decimal rupee cutoff.  
   Near ₹90 lakh crore, a JavaScript number’s spacing is ₹0.015625, so an Actual ending in `.01` can round to the wrong paise before comparison. Set the cutoff below the cent-round-trip boundary (about ₹70.37 lakh crore) or retain exact values, and test a near-₹90-lakh-crore `.01` case.
   Disposition: cut the cutoff is now 2^46 rupees (about ₹70.37 lakh crore), below which a JavaScript number's spacing is under one paisa; the displayed Actual's paise come from `toFixed(2)` text rather than multiplying by 100; leaves prove a `.01` value just below the cutoff compares exactly and a `.01` value near ₹90 lakh crore is not drillable.

## Round 21

46. Gap: the high-value non-clickable exception is absent from the confirmed spec.  
   The plan now makes a valid Actual inert at ₹70.37 lakh crore, while the confirmed behavior defines clickability by feeding lines. Amend and reconfirm the spec with this supported-range limit, or remove the exception.
   Disposition: cut the confirmed spec now states the limit (Size limit under Opening an Actual's transactions, C5d and C8), amended in the fix spec-ask-actuals-too-large-for-exact-pai and confirmed by Rahul Anand on 2026-10-03.

## Round 22

47. Gap: the specified size-limit context cannot be built within `GL-ANSWER-WIRING`’s scope.
    `AskDrillContextRow` and its signed Zod schema currently require `actualPaise`; the plan requires an oversized row’s signed entry to contain only its key and non-clickable marker. Add `backend/src/chat/ask-drill-context.ts` and its signer test to the task’s Scope/Tests, proving a no-amount entry verifies and the route refuses it before any read.
    Disposition: cut GL-ANSWER-WIRING now scopes `ask-drill-context.ts` and its test: the signed row schema gains the no-amount, not-clickable variant, a signer leaf proves it verifies, and the route leaf proves a request for it is refused before any read.

## Round 23

48. Unproven: item 7: an oversized-row request is refusal-audited before returning.
    The new leaf promises only “refuses … before any transaction read.” Since the signed context makes this a valid-but-inert row, add an `ask-drill.service.test.ts` assertion that its refusal writes `writeDrillRefusalEvent` as well as making no transaction read.
    Disposition: cut the oversized-row refusal writes `writeDrillRefusalEvent` and starts no transaction read, both asserted in `ask-drill.service.test.ts`.

## Round 24

49. Unproven: C5d: the no-amount context variant rejects a clickable row.
    Add an `ask-drill-context.test.ts` leaf proving `{ drillable: true }` without `actualPaise` is rejected. Otherwise an optional field can let a malformed signed claim pass verification and reach a transaction read before the missing footer target fails.
    Disposition: cut the signed row schema is a discriminated union, so a clickable row must carry `actualPaise`; an `ask-drill-context.test.ts` leaf proves `{ drillable: true }` without it is rejected at verification.

## Round 25

50. Contradiction: detail 7 still requires footing a sum above ₹90 lakh crore.
    That amount exceeds the confirmed `2^46` limit, so C5d requires a no-amount inert row and a refused route request. Replace the existing above-limit route-footing leaf with the specified size-limit refusal; keep any exact aggregate test below the cutoff or make it repository-only.
    Disposition: cut detail 7 now keeps the above-₹90-lakh-crore exactness proof in the drill repository only; GL-ANSWER-WIRING replaces the merged route-level footing leaf for that amount with the size-limit refusal leaf, as C5d requires.

## Round 26

No findings.

## Round 27

51. Gap: a request with no context cannot reach the service or be audited as required.
    `AskDrillRequest`, `askDrillSchema`, and its Swagger DTO all currently require a non-empty `context`, so Nest rejects an omitted context before `AskDrillService` and its refusal audit run. Add the contract/schema/Swagger files and their tests to GL-ANSWER-WIRING’s Scope/Tests, make only the missing-context shape reach the service as an invalid link, and prove the authenticated HTTP request writes the refusal audit before any read.
    Disposition: keep the GL-ANSWER-WIRING branch already handles this without changing the published contract: `ask-drill.controller.ts` recognises a body whose `context` is absent, empty or blank (with a valid `rowKey` and `page`) before schema validation and passes it to `AskDrillService` as an empty context, which refuses it like a tampered link, writes the refusal audit and starts no read. The authenticated HTTP request is proven in the app-DB leaf `ask-drill.controller.db.test.ts` (403, one persisted `mis.drill.refusal`, no warehouse read) and in the live check (commits 6bfe5f1 and 513bda7 on that branch). Valid requests keep `context` required in the contract, schema and Swagger.

## Round 28

No findings.
