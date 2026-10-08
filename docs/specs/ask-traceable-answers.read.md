---
reader: codex (gpt-5.6-terra), a separate Codex conversation because Claude Code isn't installed
read_at: 2026-10-08T08:19:09+00:00
read_hash: 7129cc841dc239335a4d68ccf87be1119d570454
round: 4
passed: yes
doc_seen: 7129cc841dc239335a4d68ccf87be1119d570454
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
notes_seen: 1b3be9fbcc94d4546dfbf14aaf02d58b3295a1cf
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. Contradiction: clickable Ask totals conflict with confirmed rules.
   `ask-gl-names-and-transactions.md` explicitly makes totals inert. Accepted decision 0040 also defines comparison totals as all filtered rows, including rows beyond `LIMIT`, while this spec makes comparison, ranked and top-N totals the union of displayed rows. Amend or supersede the prior spec and decide which total is displayed and drilled.
   Disposition: keep The spec now supersedes the Ask-only inert-total clause and keeps decision 0040's all-filtered-groups total and matching drill scope.

2. Gap: neither a displayed Actual total nor an Actual KPI has a drill target contract.
   Existing Ask drill metadata addresses result rows only; `totals` has no row key, predicate, exact-paise amount, eligibility marker, or UI interaction. Define a distinct signed total target, including its label, predicate-union encoding, and the inert outcome when it exceeds a bound.
   Disposition: keep The spec defines the reserved total target, independent signed context, label, broad or union predicate and bound-specific inert outcome.

3. Cut or defer: ranking and top-N totals.
   The governed `Selection` has a limit but no ranking/sort contract, and the target trend question needs neither. Removing “ranking or top-N” preserves the stated demo and avoids introducing an ungoverned ordering feature.
   Disposition: cut Ranking and top-N semantics are removed and named out of scope.

4. Gap: “any supported combination” does not define the supported drill matrix.
   The semantic catalog has `month`, `plant`, and `gl_code` in governed-financial, but only `leaf_key` and `plant` in mis-statement; the current drill shape supports only GL/leaf, optionally with plant. Pin every allowed dimension set, its canonical row key, and its raw SAP predicate—especially month-only, month-plus-plant, month-plus-GL, and totals—rather than leaving “statement leaf” and “month” ambiguously combinable.
   Disposition: keep The spec now pins every governed-financial and statement dimension set, key order and raw coordinate effect.

5. Gap: complete-versus-referential classification is not deterministic enough to build safely.
   Define the exact signals that make a question complete, which prior selection supplies an omitted slot, and which fields must be cleared when the current question says “Actual and Budget” without a comparison. Otherwise an explicit period can be corrected while a prior GL filter, limit, or comparison remains silently inherited.
   Disposition: keep The spec now lists the complete follow-up signal vocabulary, the one prior turn used and per-slot replace, add and clear rules.

6. Gap: range refusal and clarification behaviour is underspecified.
   Define response class, typed `details.reason`, and user wording for malformed endpoints, reversed endpoints, multiple ranges, incomplete `to` phrases, and “domain-incompatible” ranges. The current parser normalizes reversed shared-year ranges and can match the first month of a two-endpoint range, exactly the silent collapse this spec prohibits.
   Disposition: keep Five typed interpretation reasons, response class, exact wording and no-read result are now defined.

7. Gap: “bounded” drill contexts and row counts have no enforceable bound or failure rule.
   Specify the maximum signed-context size, displayed-row/union size, and batch count; say whether one oversized target, all targets, or only the total becomes inert. Acceptance criterion 7 requires oversized requests to fail closed but never defines “oversized.”
   Disposition: keep Fixed row, union, batch and encoded-context limits now define whether rows, total or the request becomes inert or refused.

8. Unproven: items 1–8 lack named proof leaves for the critical boundaries.
   Add explicit hermetic/frontend proofs for complete-after-over-budget history, each accepted range spelling and reversal, each allowed dimension shape, KPI and total predicates, comparison totals beyond `LIMIT`, offsetting zero, stored/chart inertness, and every typed refusal. Item 9 currently names test categories, not these cases.
   Disposition: keep Acceptance criterion 10 now enumerates the required semantic, boundary, UI, security and lifecycle proof leaves.

9. Trap: predicate duplication: items 5–7.
   “Reuse the governed predicate builder” must name and export the authoritative builder and its input/output contract. The raw SAP predicate must cover the executed effective plant scope, window, filters, pinned batches, and displayed-row union without a second implementation of filter semantics.
   Disposition: keep The spec names buildAskDrillTargetPredicate and buildDrillPredicate as the only two translation owners and defines their inputs and outputs.

10. Trap: generic exception envelopes hide refusal reasons: items 2 and 7.
   The global exception filter replaces exception messages. Range and drill refusals therefore need stable typed reasons in the response envelope; status codes or generic copy cannot let the client explain malformed, expired, altered, missing-batch, or non-footing cases.
   Disposition: keep The spec defines stable interpretation and drill reason enums carried in typed response or error details, independent of exception messages.

## Round 2

11. Disputed keep 5: the follow-up signals misclassify complete questions.
    `above` is also an explicit comparison word, so “Show Actual above Budget for DUB April 2026” receives prior turns despite being complete. `previous` likewise appears in standalone periods such as “previous financial year.” Restrict these to unambiguous referential phrases and prove they do not alter fresh-question parity.
    Disposition: keep Above and previous were removed; only the enumerated leading cues and unambiguous demonstrative phrases trigger context, with fresh-parity proofs named.

12. Disputed keep 9: a total union still has no pinned `DrillPredicate` representation.
    The current predicate supports one GL scope or one triples scope. A union of up to 1,000 filtered group coordinates needs an explicit discriminant, de-duplication rule, and SQL compilation shape; “one `DrillPredicate`” does not define any of them.
    Disposition: keep AtomicDrillPredicate and the union discriminant, canonical de-duplication and parenthesized SQL compilation are now explicit; the fixed union bound is 100.

13. Gap: `period-domain-unsupported` does not say that it carries the existing typed `periodChoice`.
    Its text says the choice “says” which month to use, but does not require the base selection, offered complete windows, or the zero-selector-call continuation from `ask-period-control.md`. Unproven: item 2: a multi-month statement request is recoverable through that typed choice.
    Disposition: keep The issue now explicitly carries the existing complete typed period choice and zero-selector continuation.

14. Gap: the total-union context changes the signed-context disclosure contract without deciding it.
    The union must carry coordinates for filtered groups beyond the displayed limit, while the confirmed Ask drill spec permits signed, client-decodable contexts only for displayed row keys and figures. Explicitly allow those hidden coordinates without individual amounts, or choose an opaque/server-held representation, and prove the context leaks neither hidden values nor transaction rows.
    Disposition: keep Authorized hidden coordinates are explicitly allowed without amounts or raw data, remain out of Bedrock, and gain a decoded-context non-disclosure proof.

15. Gap: unwindowed Actual answers have no drill-window rule.
    `ask-period-control.md` permits Actual-only governed answers over all loaded data, but this spec requires `buildAskDrillTargetPredicate` to receive a complete applied window. Define whether such rows and totals are inert or derive their range and pins from the contributing batches, including non-contiguous months. Unproven: items 5–6: an unwindowed Actual-by-month answer.
    Disposition: keep Unwindowed targets now derive the outer range from exact contributing pins, retain pin-based gaps, narrow month rows, and are inert for absent, invalid or over-bound pins.

## Round 3

16. Disputed keep 12: `AtomicDrillPredicate` is still not defined for several supported governed shapes.
    The existing `gl-and-plants` variant requires a GL code, while `[month]`, `[plant]`, `[month, plant]`, and an ungrouped KPI require an atomic predicate with neither a GL code nor statement triples. “Extended” does not pin the discriminants or fields that `buildDrillPredicate` must compile for those shapes.
    Disposition: keep AtomicDrillPredicate now has exact slice and triples variants; slice allows empty filters and covers every non-GL governed shape without invented fields.

17. Gap: the encoded-context limit is not an ingress limit.
    A hostile request can send an arbitrarily large base64 context before decoded claims are checked. Require a 65,536-character pre-decode request cap that still reaches the audited refusal path, with a proof for a 65,537-character context.
    Disposition: keep The request schema and controller-to-service audited refusal path now enforce the 65,536-character pre-decode cap, with the 65,537-character proof named.

18. Unproven: item 7: exact-paise safety for the new KPI and total targets.
    The inherited `2^46` Actual limit protects signed row amounts, but item 10 does not prove the same positive and negative boundary for `AskDrillMetadata.total` or an ungrouped KPI. Those targets must become inert without signing an inexact paise amount.
    Disposition: keep The exact signed-money boundary now applies to rows, KPI and total, with positive and negative below-limit and at-limit proofs named.

## Round 4

No findings.
