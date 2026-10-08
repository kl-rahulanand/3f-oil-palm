---
reader: claude (opus)
read_at: 2026-10-08T17:41:27+00:00
read_hash: 53ed750ef7fceeba0f3d6a1b64484fa04b8871c7
round: 3
passed: no
doc_seen: 53ed750ef7fceeba0f3d6a1b64484fa04b8871c7
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
notes_seen: 7d7408338a9628c4429d7dd6334c1e1f88ac07d8
---

# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. Prior answers in the conversation history could send money values to the model.
   Disposition: keep: Model/errors section now excludes rendered answers from every call; follow-up after a numeric answer is named in acceptance 6.
   The spec says follow-ups reuse confirmed scope, and the short answers are built from server results. If those answer turns stay in the LangGraph message state and go back to Claude on the next turn, criterion 6 fails. The spec should say that each model request carries only user-written text plus a cleaned-up record of the confirmed scope, with no rendered answer text. One check in criterion 6 should replay a follow-up after a numeric answer.

2. The spec never says the model's own text is not shown as an answer.
   Disposition: keep: All financial text/UI comes from server templates; prose-only numeric replies are refused, with acceptance 1 evidence.
   Sonnet 5.5 rejects forced tool use (decision 0046), so the model can reply in prose, possibly with a guessed figure, instead of calling a tool. The spec needs a rule: all answer text comes from server templates, and a model reply without a valid selection is shown as a clarification or a fixed refusal, never as model prose. Unproven: item 1: the model answers in prose that contains a number.

3. "Every clickable Actual has a prepared page" (criterion 4) conflicts with decision 0043's requirement that preparation be bounded.
   Disposition: keep: Prepared-transactions section pins 200 distinct scopes per owner decision 0051, pre-execution narrowing and explicit preparation failures; acceptance 4 proves them.
   A comparison by GL or a 12-month trend could mean hundreds of prepared pages. The spec should set a cap on how many pages are prepared per answer. Above the cap, those Actuals are either loaded on click or not clickable, and a preparation that fails must say so rather than look ready. The spec should also say which Actuals are clickable: grand totals, the Unmapped bucket, multi-Plant totals. Unproven: item 4: cap exceeded; item 4: a prepared page fails while the summary succeeds.

4. Totals across Plants or months with partial Budget coverage are not pinned.
   Disposition: keep: Supported calculations pins explicit all-my-Plants, incomplete comparison/percentage and missing closing-month Roll-over; D8 and acceptance 1/2 cover them.
   Decision 0042 says an all-Plants or multi-month answer with missing Budget must flag that it is incomplete rather than present a complete comparison. The spec only covers single Plant/month "not loaded" states. It should define how totals, % and closing-month Roll-over behave in these cases:
   - a DUB plus non-DUB total;
   - a YTD range where some months have no Budget;
   - a closing month with no Budget.

   It should also say whether "all my Plants" is a valid Plant answer. Unproven: item 2: a range where some months lack Budget; item 1: a multi-Plant comparison.

5. Plant-level % with Unmapped Actuals is ambiguous.
   Disposition: keep: Plant/GL numerator includes Unmapped; component reads use recorded provisional seed without runtime inference, following accepted 0022/0042.
   Known-Plant Unmapped rows count in Plant Actual totals, but % uses "matching aggregate Actual and Budget". The spec should say whether Plant-level % includes Unmapped Actual. It should also say whether only approved mappings count, given that decision 0022 keeps the current mapping master provisional. If nothing is "approved" yet, every component comparison comes back empty. Unproven: item 1: a Plant comparison containing Unmapped rows.

6. A month with no Actual data has no defined state.
   Disposition: keep: Explicit Actual coverage distinguishes unloaded from loaded-zero; D12 and YTD follow-up require gaps/closing-period clarification.
   Budget gets a distinct "not loaded" state, but Actual does not. The spec should say whether a month outside the loaded Actual months (e.g. September, when the 5-month file stops earlier) shows zero, a gap, or a refusal. It should also say whether "YTD" with no closing month means asking for clarification. Unproven: item 2: a trend that runs past the loaded Actual months; item 3: "YTD" given with no closing month.

7. Month-to-month change is in the Behaviour section but has no definition or acceptance criterion.
   Disposition: keep: D4 is the approved trend use case; monetary deltas and prior-zero/missing behavior are defined and proven in acceptance 2.
   Define it as an amount, a percentage, or both. Define what it shows when the prior month is missing or zero, and which measures it applies to. Then add it to criterion 2, or cut it. Cut or defer: month-to-month changes, unless a demo question needs them.

8. Cut or defer: "approved typed source dimensions" for Actual-only queries.
   Disposition: keep: The user requested source dimensions; the supported list is explicit, with a fixed server matrix and native GL Budget leaf aggregation.
   Neither the Why nor the success measure needs dimensions beyond Plant, Month, GL, Cost Center and Component, such as Section, Consideration, Short Name, Contra Account, Origin and Location. Name the list the demo questions need. Also name which dimensions have a "reviewed Budget correspondence", including whether GL is one: decision 0042 leaves the GL grain of Budget open.

9. Cut or defer: Roll-over as a chat measure.
   Disposition: keep: Accepted 0041/0043 retains stored Roll-over; Why and D6 now name its job and monthly/closing-month rules.
   The Why asks for spending against Budget, but only criterion 2 mentions Roll-over. Either add it to the Why or the demo questions, or defer it. If it stays, also state the per-month trend rule, not only the range/YTD rule.

10. The success measure's demo questions, golden selections and follow-up cases are not named.
    Disposition: keep: D1-D12 and named follow-ups pin semantic selections/outcomes; independent source golden values are required before live acceptance.
    "Every named case" has nothing named. The spec should list the demo questions and follow-up cases, or point to a file of them with expected selections from the workbook. Otherwise the three-run target cannot be checked.

11. Unknown-Plant rows have an undefined reader.
    Disposition: keep: Unknown Plants are operator reconciliation evidence only; no chat reader/new entitlement is introduced.
    "Excluded from ordinary Plant answers" implies non-ordinary answers exist. Decision 0042 lets explicitly permitted users review them, but no such grant exists in `user_scope` or the role permissions. Simpler: unknown-Plant rows appear only in the load reconciliation evidence, never in the chat, for this PoC.

12. Loading, choosing the active load and the failed-load path are unspecified.
    Disposition: keep: Dedicated operator CLI, immutable validated activation, failed-first/replacement behavior and pinned source paging are specified.
    Criterion 5 needs new loads, but the spec does not say how a load is triggered or which reconciled load is read when there are several. It also does not say what a chat user sees when no reconciled load exists or the newest one failed reconciliation. Unproven: item 5: failed reconciliation blocks the chat; item 4: a replacement load arrives between page 1 and page 2. Decision 0043 says the user is asked to rerun.

13. Resuming after a refresh can show cached results after a Plant grant is revoked.
    Disposition: keep: Resume/replay/emission checks current ownership/grants; explicit memory/expiry/eviction limits and acceptance 3 cover them.
    Criterion 3 checks revocation only on the next query and pagination. A resumed conversation re-renders earlier answers and prepared transaction pages. The spec should say whether resume rechecks Plant grants or hides them. It should also bound in-memory conversation growth (expiry or eviction) and treat an evicted conversation like a restart. Unproven: item 3: resume after revocation; item 3: another user's conversation ID is presented.

14. Unproven: item 1: unsupported requests (e.g. Budget by Cost Center) show a clear refusal.
    Disposition: keep: D10 and acceptance 1 require a fixed typed refusal without allocation.
    The spec bans Cost Center Budget allocation but no criterion proves what the user sees instead.

15. Trap: the global exception filter replaces messages: items 1, 3 and 4.
    Disposition: keep: Model/errors section requires details.reason for the named denial, expired, data and provider outcomes.
    These refusals all need a typed `details.reason` so the client can explain them:
    - unsupported comparison;
    - stale conversation after restart;
    - expired or revoked drill-down handle;
    - load not available;
    - model unavailable.

16. Unproven: item 6: model failure paths.
    Disposition: keep: Acceptance 6 now names missing configuration/access, timeout/rate-limit/cancel, no fallback and measured timing/usage.
    Decision 0046 requires reporting a missing key, an unavailable model, a timeout or rate limit, and cancellation, with no silent fallback. No criterion covers what the user sees in those cases, or the latency and usage measurement that decision 0046 lists for final acceptance.

17. The vendor and residency check before real requests is missing.
    Disposition: keep: Project owner records vendor/access/billing/retention/residency confirmation before real new-chat requests; no credentials or prior login proves it.
    Decisions 0045 and 0046 require checking account access, billing, retention and residency before any real Anthropic request. Direct Anthropic loses decision 0027's Mumbai guarantee, and the brief notes an NDA with residency expectations to confirm. Sending client question text to a new vendor is a one-way step. The spec should name this check as a precondition of criterion 6 and say who confirms it.

18. "Every query is authorized and audited" has no acceptance criterion.
    Disposition: keep: Audit metadata/exclusions and acceptance 1 define actor/action/scope/failure evidence without prompts/money/rows.
    The spec should say what an audit entry records, and that it holds no amounts or transaction rows. Then prove it, or drop the word "audited".

19. The old Ask's fate is unstated.
    Disposition: keep: Independent flag-gated Financial Chat route/navigation is explicit; old Ask remains reachable/unchanged and is regression-covered.
    Decision 0043 requires the cutover or removal scope to be explicit. The spec should say whether the existing Ask stays reachable next to the new chat and where the new chat sits in navigation. Criterion 5's regression list should then include or exclude the old Ask.

20. Trap: no network in CI: item 6.
    Disposition: keep: Real Claude probes are gated/manual outside CI; hermetic vendor fixtures are not live evidence.
    Live Claude runs and payload inspection against the real API must be a gated or manual check outside CI. Hermetic tests can only replay recorded model outputs.

21. Trap: a follow-up can carry a relative window that overrides a named month: item 3.
    Disposition: keep: Named follow-up case proves explicitly named April 2026 overrides earlier relative context.
    The follow-up cases should include one where a follow-up names a month after an earlier relative window, and check that the named month wins.

22. Trap: tests that boot the real app module fail only in CI, and gated warehouse tests TRUNCATE tables: items 3 and 5.
    Disposition: keep: Acceptance 6 pins scanner/loader hermetic resolution and disposable :5434/:5435, never live :5433/:5432.
    The new LangGraph module and the `agent_financial` loader tests must resolve module graphs without booting `AppModule`. They must run against a throwaway Postgres on 5434, never on 5433.

23. The Source section is stale.
    Disposition: keep: Source now cites accepted 0042-0046.
    It cites "accepted decisions 0042-0044", but the Rules rely on 0045 and 0046 as well.

## Round 2

24. The Behaviour bullets still contradict the new calculation section.
    Disposition: keep: Bullets now match recorded provisional mappings and reconciliation-only unknown Plants.
    Line 31 says comparisons need a "reviewed Budget correspondence" and line 37 says mapping uses "approved" Plant/Cost Center/GL. The new text says the seeded mappings stay provisional and no business-approved status is implied. Line 34's "excluded from ordinary Plant answers" still suggests some other answer can show unknown-Plant rows. The bullets should be reworded to match the new section, so a builder doesn't look for an approval status that doesn't exist.

25. The doc refers to "stage 1" and "stage 3/acceptance", but defines no stages.
    Disposition: keep: Spec responsibilities refer to the implementing story's contract/import/acceptance tasks.
    The demo case IDs, the golden amounts and the model API parameters are each assigned to a stage that only a later story can define. The spec should say "the implementing story pins …" or name the step that owns each one.

26. Actual coverage per Plant is undefined, so loaded-zero and unloaded can't be told apart for a Plant with no lines.
    Disposition: keep: Owner accepted decision 0048: only confirmed complete Plant/month
    coverage permits zero for an empty set. Workbook load or transaction presence alone
    does not certify completeness; unconfirmed coverage is "Actual data not loaded".
    Spec acceptance 2 and schema/import/query/UI/verification plans cover both empty states
    and partial rows without confirmation. Coverage input/evidence format is an implementation seam.
    "Coverage is explicit per Plant/month", but a load is one workbook. The spec should say whether a loaded month counts as loaded for every known Plant, or only for Plants that have at least one line. This decides whether D8, for a Plant with no April lines, shows zero or "unavailable". Unproven: item 2: a permitted Plant with no lines in a loaded month.

27. Budget for a GL with Actuals but no Budget leaf, in a loaded DUB month, is not pinned.
    Disposition: keep: Owner decisions 0047 and 0049 settle both cases. Actual-only GLs
    retain exact Actual/prepared transactions with null Budget/"No Budget line for this GL"
    and Not applicable percentage. Budget leaves without GL appear once under "GL not assigned",
    included in same-scope Budget totals, without inferred Actual mapping. Spec acceptance 1
    and contract/import/query/UI/verification plans cover retained rows and total reconciliation.
    In D2, a GL that has Actual lines but no Budget leaf could show Budget as zero, as no Budget line, or as "not loaded". Each gives a different % display and a different total. It is also unstated where a Budget leaf without a GL goes in a GL grouping, and whether the GL rows still add up to the Plant total. Unproven: item 1: D2 with Actual-only GLs and Budget leaves that have no GL.

28. D3 doesn't say whether a component grouping shows an Unmapped row.
    Disposition: keep: Owner decisions 0050/0051 retain Unmapped and missing Actual
    dimension buckets with prepared transactions and grouped-to-total reconciliation.
    Spec and contract/query/drill/UI/verification plans cover the missing Cost Center
    and other nullable Actual dimensions.
    Component totals exclude the Unmapped bucket, but the Unmapped bucket is listed as a clickable coordinate. The spec should say whether a "by component" answer shows an Unmapped row, so the table adds up to the Plant total. Likewise, D7 doesn't say how lines with a missing Cost Center appear, nor how nulls appear in the other Actual-only dimensions. Unproven: item 1: D3's Unmapped row; D7's missing-Cost-Center row.

29. D3 may break the 50-scope cap.
    Disposition: keep: Owner decision 0051 replaces 50 with 200, counting all advertised
    distinct Actual scopes including parents, total, zero/empty and missing buckets, with
    chart/table deduplication. Spec/stage 9 require source profiling of named demo selections
    before live acceptance plus 200/201 capacity proof, not an assumed fit.
    A Nursery component grouping that includes recorded hierarchy parents can have more than 50 rows. The spec doesn't say whether parent rows and components with zero Actual count as Actual scopes. If they do, D3 is forced into "please narrow", which contradicts its expected outcome. The spec should state how scopes are counted and confirm that D1–D12 fit under the cap.

30. The typed refusal list is missing several outcomes the spec itself introduces.
    Disposition: keep: Added typed capacity, concurrent-run, query-too-broad, feature-disabled and access-denied reasons.
    `details.reason` has no value for:

- the capacity refusal at 20 or 200 conversations;
- a second message while a run is active ("one active run");
- the 50-scope narrowing prompt, unless it is a clarification;
- the feature turned off;
- a user with no Financial Chat access.

Trap: the global exception filter replaces messages: items 3 and 4.

31. Who may use the new chat is not stated.
    Disposition: keep: Owner decision 0051 requires existing financial-report permission
    plus current Plant grants. Spec/stages 4/7/8/9 cover no-report denial, no-Plant guidance
    without data, and revoked report permission on replay/stream/paging.
    The flag turns the feature on, but no role or permission grant gives a user access. The spec doesn't say what a signed-in user with zero permitted Plants sees on the page or when asking a question. Unproven: item 3: a user with no Plant grants; a user without the chat permission calls the endpoints directly.

32. "Missing model configuration fails clearly" could take the whole backend down.
    Disposition: keep: New-model configuration failures are per-request; reports and old Ask still start. Stage 7 and stage 9 now match.
    If that means a startup failure, then with the flag on and no key, statements, exports and the old Ask stop working, which contradicts "existing report generation must keep working". The spec should pin per-request typed refusals while the app still starts, which acceptance 6's "fixed typed outcomes" already implies.

33. Trap: values a frontend build fixes at build time: item 3/5.
    Disposition: keep: Authenticated runtime capability metadata, not NEXT_PUBLIC; stages 7-9 prove toggles with the same build.
    `FINANCIAL_CHAT_ENABLED` gates the navigation entry and the page. If the UI reads it as a `NEXT_PUBLIC_*` variable, it is frozen when the frontend is built, and on the demo deployment it can disagree with the backend flag. The spec should say the UI learns the flag from the backend at runtime. It should also add a flag-on/off case where the frontend build is unchanged.

34. Blocking missing cached formula amounts departs from decision 0041 and could stop the demo load.
    Disposition: keep: Existing accepted 0044 separates loaders; operator requests a recalculated/saved new source and records blocked/different legacy behavior, never changes 0041's legacy rule.
    Decision 0041/0020 keeps uncomputed formula results as zero with a visible count. The new loader instead blocks the whole generation. If the supplied workbook has any uncomputed cells, the chat cannot load at all. That would also create a chat/report difference that acceptance 5 must explain. The spec should either confirm the supplied workbook has zero uncomputed cells or say what the operator does when a load is blocked.

35. Trap: Windows shells: item 5.
    Disposition: keep: Acceptance 5 runs the real supplied path with quoting in PowerShell/cmd/Git Bash.
    The supplied workbook is named `5 Months Financial Data - Knack labs POC (1).xlsx`, which contains spaces and parentheses. The CLI loader's path argument needs a PowerShell, cmd and Git Bash quoting case. No acceptance evidence for item 5 runs the loader on such a path.

## Round 3

36. Nothing says who confirms which Plant/months have complete Actual data, so every demo answer could come back "Actual data not loaded".
    Owner note: the completeness-confirmation process was deferred for the PoC. Decision
    0048 is not revoked: do not infer complete coverage or claim DUB April-August confirmed.
    This finding remains open; no clean review or successful loaded-data demo is claimed.
    Decision 0048 says only confirmed complete coverage allows a value or a zero. But the loader is described only as reading the original workbook with explicit DUB Budget ownership, and nothing says what supplies the confirmation. The workbook does not declare completeness, and the disposition leaves the format open. The spec should name:
    - who confirms coverage (the operator, as a declared Plant/month list given to the CLI);
    - that DUB April–August 2026 is confirmed for the demo.

    D8's expected outcome mentions only partial Budget. It should also expect "Actual data not loaded" for permitted Plants without confirmed coverage, and should not total their Actuals as if complete. Unproven: item 5: a load with no coverage declaration; item 2: D8 with Plants whose coverage is unconfirmed.

37. Paging offsets are ambiguous when page 1 has 10 rows and later pages have 20.
    Disposition: keep: Spec and stages 1/5/9 pin page 2 at row 11, continuation size per
    handle and offset 10 + (page - 2) * pinned size, with stable immutable ordering and
    full-set traversal proof. Size changes are rejected rather than shifting offsets.
    "Page 1 with 10 rows; further pages default to 20 rows… and start at page 1" does not say where page 2 begins. It could start at row 11 or at row 21, so rows 11–20 could be skipped or shown twice. The spec should pin cursor- or offset-based continuation from the end of the prepared page. It should also fix a stable transaction order, such as posting date, transaction number, then line ID, so pages neither repeat nor drop lines. Unproven: item 4: paging after the prepared page covers every line exactly once.

38. The Unmapped row's Budget and percentage display is not pinned.
    Disposition: keep: Spec and stages 1/4/8/9 pin null Budget/"No Budget assigned to
    Unmapped", null/Not applicable percentage and no contribution/allocation to Budget totals.
    Decision 0050 forbids allocating Budget to Unmapped, but the spec gives labels only for "No Budget line for this GL" and "Budget not loaded". In D3, the Unmapped row's Budget cell needs a defined null state and label, and its percentage needs "Not applicable". It should also be clear that the comparison's Budget total excludes it. Unproven: item 1: D3's Unmapped row Budget and percentage cells.

39. Percentage change with a negative prior value is undefined.
    Disposition: keep: Owner accepted decision 0052 after a source-backed workbook example.
    Spec and contract/query/UI/verification plans now return null/Not applicable for negative
    or zero prior, preserve monetary change, explain negative prior and use no absolute-value
    denominator. Acceptance covers negative-to-positive/negative-to-negative and positive prior.
    Net Actual can be negative after credits. "Change / previous × 100" then gives a misleading sign; for example, going from −100 to +50 reads as −150%. The spec should pin the rule: Not applicable for a negative prior, or divide by the absolute prior. Unproven: item 2: a month-to-month change from a negative prior month.

40. Preparing up to 200 drill-down pages before an answer completes has no time limit or timeout behaviour.
    Disposition: keep: Spec and stages 1/5/8/9 require a shared 30-second detail-preparation
    deadline, cancellation/no new work on expiry, completed scopes retained and unfinished
    scopes explicitly failed while exact summary remains visible. Controlled-time proof is required;
    this does not claim an owner-approved overall latency target or measured performance.
    Up to 200 full-total reads plus first pages must finish before the answer shows. Acceptance 6 only measures timing and sets no target. The spec should give a bound on answer preparation time. It should also say what the user sees when preparation times out. It could be the same detail-failed state per cell while the exact summary still shows, or a typed refusal. Unproven: item 4: preparation times out on a large answer.
