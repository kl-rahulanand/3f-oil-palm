---
reader: claude (opus)
read_at: 2026-10-08T18:26:44+00:00
read_hash: fe1b49fb1a625753c98d86a540d3164428db349d
round: 1
passed: no
doc_seen: fe1b49fb1a625753c98d86a540d3164428db349d
spec_seen: 09e8a5e072cf993145e9e4b867bc66fb77b4dbfd
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
