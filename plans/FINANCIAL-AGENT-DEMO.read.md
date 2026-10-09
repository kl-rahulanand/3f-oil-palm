---
reader: codex (gpt-5.6-terra), a separate Codex conversation because Claude Code isn't installed
read_at: 2026-10-09T13:48:41+00:00
read_hash: ff66d0bfeaaa233c6ca2854b00504991e1f3e61e
round: 7
passed: yes
doc_seen: ff66d0bfeaaa233c6ca2854b00504991e1f3e61e
spec_seen: 09e8a5e072cf993145e9e4b867bc66fb77b4dbfd
notes_seen: f3e6d0b6cb721de5632924d55922a44e05bad2f5
---

# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. Gap: backend leaves under `backend/test/` have no runner, no type check and no registry coverage.
   Disposition: keep: All new helpers/leaves now live under backend/src/financial-chat,
   covered by existing rootDir/include and gate discovery; Tasks pins hermetic/DB routing
   and every backend row explicitly scopes package.json and quality-gate registration.
   - BASELINE, FIXTURES and REGRESSION name `backend/test/*.test.ts`, but `backend/test/` does not exist yet.
   - `backend/tsconfig.json` sets `rootDir: src` and `include: ["src/**/*"]`, so `npm run typecheck` never sees these files.
   - The gate's `backendTests()` only scans `backend/src`, so registering them is never enforced.
   - Pin in BASELINE (the first task that needs it): which script runs them (hermetic, `test:db` or `test:warehouse-proof`), how they get type-checked (a `backend/test` tsconfig, or moving them under `backend/src`), and how the gate discovers them. Without this, the "named leaf observed executing" rule cannot be checked for three tasks.

2. Trap: the gate pins the contract test script: CONTRACT.
   Disposition: keep: Both CONTRACT and RESPONSE scope tools/quality-gate.test.mjs and
   contract/package.json for their named leaf registration and pinned-script update.
   - `tools/quality-gate.test.mjs` pins the body of `contract/package.json`'s `test` script, so adding `contract/test/financial-chat.test.ts` breaks the gate.
   - The Scope rule adds `tools/quality-gate.test.mjs` only for rows that name a backend test, so CONTRACT's Scope leaves it out. Add it.

3. Gap: the new-model config keys are first needed by MODEL, but only WIRING may edit `backend/src/config.ts`.
   Disposition: keep: MODEL now owns central flag/model/key/retry/timeout configuration,
   env examples and safe-startup/per-request proof before API/STREAM depend on it.
   - Stage 6 sets `FINANCIAL_CHAT_MODEL_PROVIDER`, `FINANCIAL_CHAT_MODEL_ID` and `ANTHROPIC_API_KEY` in MODEL, plus timeouts and retries.
   - `FINANCIAL_CHAT_ENABLED` is needed by API and STREAM for the feature-disabled refusal.
   - `config.ts` and `.env.example` sit only in WIRING's Scope, which runs last. MODEL must either read `process.env` around the central config or wait for WIRING.
   - Put the `config.ts` keys and their safe-at-startup parsing in MODEL (or CONTRACT); leave only module and navigation wiring to WIRING.

4. Gap: BASELINE's legacy snapshot and old-Ask capture are unpinned and possibly non-deterministic.
   Disposition: keep: BASELINE owns pre-migration browser capture/Playwright and fixed legacy
   snapshot from unchanged ingestion of the checksummed supplied source on disposable DBs;
   snapshots stay outside Git. Old Ask uses recorded selections at its vendor boundary,
   not live Bedrock. Synthetic CI baseline is independently labelled; REGRESSION restores
   the identical snapshot and replays API/UI results.
   - Stage 9 says to baseline and repeat existing Ask through its real API and UI on a fixed warehouse snapshot. Old Ask calls live Bedrock, which varies between runs and needs network.
   - BASELINE's Scope holds no browser file.
   - Nothing names where the fixed legacy snapshot comes from, where it is stored, or how it is restored onto :5434 for both the before and after runs.
   - Pin: the snapshot source and how it is restored; whether old Ask is compared on recorded selections and server answers or live; and which task captures the old-Ask UI baseline.

5. Trap: Windows shells on Linux CI: item 5.
   Disposition: keep: LOAD's tests only exercise platform-neutral argument handling with
   spaced filenames. ROLLOUT owns manual real-file PowerShell/cmd/Git Bash evidence,
   explicitly not Linux CI.
   - The quoted real-filename CLI run in PowerShell, cmd and Git Bash is assigned to LOAD's node test ("quoted paths").
   - CI runs on Linux with no cmd or PowerShell, and the supplied workbook path has spaces and parentheses.
   - Say that the three-shell run is a manual or Windows-only step, owned by ROLLOUT's runbook walk with recorded commands. The hermetic test should prove only argument handling.

6. Unproven: item 1: audit entries record actor, nonfinancial scope, opaque references and failure category, with no prompts, amounts or rows.
   Disposition: keep: CATALOG Tests and review-pinned seams explicitly assert audit fields
   and exclusion of prompts/amounts/rows/raw handles at the real service boundary.
   - Spec acceptance 1 requires this, but no Tests cell mentions audit.
   - Add it to CATALOG or API.

7. Unproven: item 1: a prose-only, malformed or unknown-tool model reply never becomes a financial answer.
   Disposition: keep: GRAPH Tests explicitly cover all three reply forms refusing before
   financial execution/answer, rather than treating prose as financial output.
   - MODEL tests vendor errors and GRAPH tests causal refusal, but neither names this case.
   - It belongs in GRAPH's or ANSWER's Tests cell.

8. Unproven: item 1: unknown-Plant rows never appear in chat results, even when the user can see every known Plant.
   Disposition: keep: QUERY Tests explicitly exclude unknown-Plant rows under all-known-
   Plants grants while source reconciliation still accounts for them.
   - LOAD proves they are reconciled, but QUERY's test lists only Unmapped and missing GL.

9. Unproven: item 4: Budget, Roll-over and percentage cells are not clickable.
   Disposition: keep: VALUES Tests explicitly pin all three non-clickable measures and
   SYNTHETIC includes browser proof; only Actual/labelled partial Actual has handles.
   - This is spec acceptance 4 evidence, but VALUES and DETAIL list only Actual behaviours.

10. Simpler: the "pinned LangGraph/React transport" on the frontend → the platform `fetch`/`ReadableStream` reader.
    Disposition: keep: TRANSPORT/CLIENT use native credentialed fetch/ReadableStream with
    typed frames and fixed local UI; LangGraph stays on backend. No frontend SDK dependency.
    - Every answer and UI block is a server template, so the client only consumes typed custom frames. A LangGraph React SDK adds React 19/Next compatibility risk (part of TRANSPORT's proof) and nothing done-when 3 or 6 needs.
    - Keep LangGraph on the backend only; the frontend change then needs only `frontend/package.json`/lockfile edits for Playwright.

11. Split: CONTRACT → tool and selection schemas | UI, paging and error types.
    Disposition: keep: CONTRACT owns financial-tools.ts/input-output/selection contracts;
    RESPONSE separately owns financial-chat.ts/UI/events/capabilities/errors crossing them.
    Dependents wait for RESPONSE; both own registered contract leaves.
    - It must pin "all master names/signatures" for 29 later tasks: four strict tool input/output schemas with descriptions, money strings, partial/synthetic states, paging and typed reasons, the capabilities response and frames.
    - That is well over about 400 lines in one file and its test.

12. Split: WIRING → backend modules, capabilities controller, routes and Swagger | AppShell navigation entry.
    Disposition: keep: WIRING is backend-only; new NAVIGATION owns shell/runtime gate proof
    after WIRING, leaving the existing AskProvider untouched.
    - Its Scope spans the backend modules, capabilities controller, `app.module.ts`, config, env, two pinned route/Swagger tests and the frontend shell with its test, in both workspaces.

13. Split: BROWSER → real-source D1-D12 outcomes | synthetic numeric, paging, theme, mobile and keyboard journeys.
    Disposition: keep: BROWSER owns real-source outcomes; new SYNTHETIC owns complete-data
    numeric/paging/accessibility journeys in its own file; REGRESSION waits for both.
    - One spec file carries every Done-when 1/2/4 browser case.

14. Unneeded Scope: `.prettierignore` in WIRING.
    Disposition: keep: Removed WIRING's unnecessary ignore-list scope; conditional ignored-
    file rule still applies only if an actually ignored path is later added to a task.
    - None of WIRING's files is on the ignore list: `app.module.ts`, `config.ts`, `app.routes.test.ts`, `swagger.test.ts` and the app-shell files.
    - Remove the entry; otherwise the gate's ignore-hash pin invites an accidental edit.

15. Shared line: per-leaf registrations in `backend/package.json`'s `test:hermetic` string and the gate's `hermeticTests` array.
    Disposition: keep: Notes explicitly serialize backend-chain merges and rebase each
    task on previously merged registration/gate edits before close/merge. Registrations
    remain in each task so its named tests execute for its own close.
    - About 20 tasks edit this one line and array. Parallel chains (TRANSPORT and MODEL beside SCHEMA through PAGES) will conflict on every merge.
    - Moving registration to a last wiring task would stop each close from seeing its leaf run, so keep per-task registration. Say explicitly that the chains merge one at a time with a rebase, rather than leaving it to "coordinate at merge".

16. Decide first: the owner's vendor confirmation for done-when 6.
    Disposition: keep: Project owner records pending application account/model/billing/
    client retention/residency prerequisites in the named context document. Done-when 6,
    LIVE/ROLLOUT/final completion are explicitly blocked until confirmation, not silently
    claimed complete; approved hermetic implementation may proceed first per 0051.
    - Done-when 6 and LIVE (and so ROLLOUT and story completion) need the owner to record account/model access, billing, retention and residency, and nothing records it yet.
    - Decision 0051 explicitly says these checks are not complete.
    - Name who records it and where; otherwise list done-when 6 as blocked until then so the story does not stall at LIVE.

## Round 2

17. Gap: the new routing rule conflicts with the quality gate's test partition.
    Disposition: keep: Pin every leaf to the existing gate partition; warehouse leaves also register as gated hermetic, API controller proof uses in-memory collaborators, and actual disposable-DB/HTTP acceptance is separately required.
    - The gate requires every `backend/src/**/*.test.ts` to appear in `dbTests` or `hermeticTests`. A leaf that only "joins test:warehouse-proof" fails "every backend test must be declared hermetic or DB-backed".
    - Every existing warehouse-proof leaf is also listed in `hermeticTests`, where it skips unless `WAREHOUSE_DB_TEST=1` is set. The rule should say gated DB leaves join both lists and skip without that variable.
    - Routing API and app-DB leaves to `test:db` means they run in neither Forge's test command (`test:hermetic`) nor CI. That includes API's main HTTP proof (auth/CSRF, cross-conversation denial, paging errors), which close would never see execute.
    - The existing `chat.controller.test.ts` is hermetic, so pin API's controller leaf as hermetic with in-memory fakes. Keep `test:db` only for leaves that truly need the app DB.

18. Gap: old Ask has no recorded-selection provider for BASELINE's browser capture.
    Disposition: keep: Old Ask backend parity overrides LLM_PROVIDER only in-process; legacy Playwright tests unchanged mock clarification. No production replay switch or CoreModule change.
    - `LLM_PROVIDER` resolves to `BedrockLlmProvider` or `MockLlmProvider` in `core.module.ts`, and the mock always returns the same clarification.
    - Driving old Ask "through its real API/UI using recorded governed selections at its LLM_PROVIDER boundary" in Playwright against a running backend needs a replay provider and config switch. That means editing `core.module.ts`/`config.ts`: shared old code outside BASELINE's Scope, against "existing chat unchanged".
    - Pin one of two options:
      - Capture old-Ask parity in-process: a backend test overriding the `LLM_PROVIDER` token with recorded selections. The UI spec then covers only the mock clarification path.
      - Name the provider-switch edit, its Scope and why it leaves old behaviour unchanged.

19. Split: BASELINE → backend source oracle and report/export/drill baseline | Playwright install with legacy UI/old-Ask capture.
    Disposition: keep: Split backend BASELINE from LEGACY-UI Playwright/setup/capture; both precede migrations and the established UI harness precedes FIXTURES.
    - BASELINE now holds:
      - the independent oracle
      - generated synthetic legacy workbooks
      - real-snapshot restore through the existing ingestion API onto :5434/:5435
      - recorded old-Ask selections
      - the Playwright install and config
      - a legacy browser spec
      - backend, gate, frontend, root and lockfile edits
    - That is well past about 400 lines for one done-when item, and everything else waits on it.

20. Gap: the real supplied workbook is an input shared by several tasks, and no task pins how it is supplied.
    Disposition: keep: BASELINE owns FINANCIAL_CHAT_SOURCE_FILE and recorded SHA-256, consumed by all real-source runs. Missing input explicitly skips real cases and leaves acceptance pending; generated cases still execute.
    - BASELINE (checksum and snapshot), BROWSER (real source), REGRESSION (same snapshot) and ROLLOUT (three-shell walk) all need it. The space-and-parenthesis filename is not in Git: only `Nursery MIS Format.xlsx` is tracked.
    - BASELINE should pin the environment variable or argument that names the file, the recorded checksum, and what a registered leaf does when the file is absent (skip with a stated reason, or run on the synthetic stand-in).

21. Shared lines without an After link: BASELINE and TRANSPORT both edit `package-lock.json`, `backend/package.json`, `frontend/package.json` and `tools/quality-gate.test.mjs`.
    Disposition: keep: Native TRANSPORT has no frontend manifest scope. Serialize every shared manifest/gate/lockfile change across all task chains, rebase and regenerate lockfile with npm install.
    - CONTRACT and RESPONSE also edit the gate while BASELINE runs in parallel.
    - The Notes serialize only "backend task chains", and a lockfile conflict cannot be fixed by a textual rebase.
    - Drop `frontend/package.json` from TRANSPORT: the native-fetch transport adds no frontend dependency.
    - Then either make TRANSPORT run after BASELINE, or extend the serialization note to every task that edits the shared manifests, lockfile or gate, with the lockfile regenerated on rebase.

22. Split: MODEL → central flag/model/key/retry/timeout config with safe-startup proof | Claude provider, four instruction modules, static cache prefix and vendor-error mapping.
    Disposition: keep: Separate CONFIG owns central settings/env/safe-startup leaf; MODEL owns provider/instructions/cache/error mapping and depends on CONFIG.
    - The config half is what API and STREAM consume, and is separable.
    - The provider half alone, with its prefix-equality and payload-exclusion tests, approaches the size limit.

23. Trap: stale present tense after merges: item 6.
    Disposition: keep: Vendor prerequisite wording is conditional until owner confirmation, not a stale present-tense claim.
    - "This is currently pending, not inferred from decision 0051" in the review-pinned seams becomes false once the owner records the vendor prerequisites. It is the kind of sentence that has cost later read rounds.
    - Phrase it as a condition ("until the owner records…") rather than a present-tense state.

## Round 3

24. Trap: CI has no Playwright and no database: LEGACY-UI.
    Disposition: keep: LEGACY-UI generated and real-source checks are local disposable-DB browser runs with evidence; only the pure generated oracle runs in immutable CI.
    - LEGACY-UI's Tests cell promises "generated CI" runs of `legacy-financial-baseline.spec.ts`.
    - The CI workflow is pinned as immutable by the gate and runs only `npm ci` and `npm run verify:ci`. There is no Playwright step, no browser and no database, so no spec in `frontend/e2e/` ever runs in CI.
    - Reword it as a local run against disposable :5434/:5435 with recorded evidence. Only the pure generated-source oracle in BASELINE's backend leaf runs in CI.

25. Gap: no runner exists for leaves that need both the warehouse and the app database.
    Disposition: keep: BASELINE owns cross-platform test:financial-chat-db-proof runner/gate pin; both dual-DB leaves also register hermetic and skip without FINANCIAL_CHAT_DUAL_DB_TEST=1. Runner validates disposable warehouse/app targets before setting the flag or writing; REGRESSION appends its leaf.
    - BASELINE's in-process old-Ask parity test and REGRESSION's `financial-chat.acceptance.test.ts` (process restart, grants, pins) need both a warehouse and an app DB.
    - The routing rule offers only `test:warehouse-proof`, which sets `WAREHOUSE_DB_TEST=1` for the warehouse, or `test:db`, which covers the app DB alone. No row says which one each of these leaves joins.
    - Pin in BASELINE, the first task that needs it:
      - the runner and gate list for dual-DB leaves;
      - the environment flags they skip on;
      - that both targets are confirmed as 127.0.0.1:5434 and :5435 before any write.

## Round 4

26. Unproven: item 5: nothing tests the dual-DB guard's refusal of non-disposable targets before any write.
    Disposition: keep: BASELINE owns a shared TypeScript guard and named hermetic wrong-host/port/manual-flag refusal leaf. Every dual-DB leaf calls that guard before writes; cross-platform wrapper moves under tools lint/format coverage.
    - The new `test:financial-chat-db-proof` wrapper is the only thing between the TRUNCATE-capable BASELINE/REGRESSION leaves and the live warehouse on :5433 or app DB on :5432. BASELINE's Tests cell does not prove that it refuses other hosts or ports.
    - The leaves check only `FINANCIAL_CHAT_DUAL_DB_TEST=1`, so anyone setting that variable by hand skips the target check.
    - The wrapper is an `.mjs` file under `backend/src`, where `backend/src/**/*.ts` lint, format and typecheck never reach it.
    - Move the target check into a shared TypeScript guard that each dual-DB leaf calls before writing, as FIXTURES already does for its own refusal. Name a test of it in BASELINE's Tests cell, or move the wrapper under `tools/` so lint and format cover it, and test it there.

## Round 5

No findings.

## Round 6

27. Disputed keep 19: BASELINE remains too large after moving Playwright work to LEGACY-UI.
    Disposition: keep: BASELINE is already merged and its implementation boundaries are now historical; this amendment only adds the exact quality-gate owner required by LEGACY-UI's portable build-script change. Re-splitting landed baseline code would be unrelated rework and would not reduce the remaining task's scope.
   - It still combines the independent source oracle, legacy snapshot/report/export/drill/old-Ask parity, disposable-DB guard, and proof runner.
   - Split SOURCE-ORACLE from guarded legacy baseline capture; make SCHEMA wait for the latter.

## Round 7

No findings.
