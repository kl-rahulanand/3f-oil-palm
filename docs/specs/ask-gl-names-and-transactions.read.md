---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-02T15:15:21+00:00
read_hash: e467ae89d159db2b8729f3745ab2e705222816fe
round: 2
passed: no
doc_seen: e467ae89d159db2b8729f3745ab2e705222816fe
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
notes_seen: 26e259b3069918e6bbd98d54abe86433baf2f386
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

