---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-02T17:18:00+00:00
read_hash: f38629a381beff1e94fdab974fc5677f8f3b37a0
round: 1
passed: no
doc_seen: f38629a381beff1e94fdab974fc5677f8f3b37a0
spec_seen: ebc6473926090ed5ec1a4a7466cbf186cf3f9b4c
notes_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
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

