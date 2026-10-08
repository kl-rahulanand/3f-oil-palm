# Stage 3: Excel Import and Reconciliation Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Make the original workbook available to chat only after an independent accurate import.
**Architecture:** A dedicated parser/loader writes an inactive generation, validates every financial
row, reconciles exact source sums and atomically activates the complete PoC workbook.
**Tech Stack:** Existing ExcelJS, TypeScript, Postgres and exact decimal/paise operations.
**Spec:** [Financial chat](../../specs/langgraph-financial-chat.md).
**Global constraints:** [Master](2026-10-08-financial-chat-master.md).
**Dependencies:** Stage 2 schema; do not wrap or reuse the legacy financial parser.

## Files and ownership

- Create backend/src/financial-data/financial-workbook.parser.ts, financial-loader.ts,
  financial-load.repository.ts and their focused parser/load DB tests.
- Create backend/src/financial-data/financial-mapping.seed.ts with approved mapping provenance.
- Create backend/src/financial-data/financial-load.cli.ts; register financial:load in backend/package.json.
- Modify test registries, tools/quality-gate.test.mjs and scoped loader documentation.
- No change to Admin -> Ingest, legacy parser defaults, report tables or existing source evidence.

## Input and output interfaces

Stage 9's test-owned harness calls the real loader with explicit synthetic source identity
and synthetic workbooks only on 127.0.0.1:5434. Its fixture completeness setup rejects any
non-synthetic batch/other destination; normal loader/CLI has no completeness override.
Persist source classification for query/UI's mandatory "Synthetic test data" label.

parseFinancialWorkbook(buffer, declaredBudgetOwner): ParsedFinancialWorkbook returns normalized
Actual lines, monthly Budget leaves, hierarchy, row evidence, coverage and structured validation.
Retain genuine Budget leaves without GL as nullable-GL facts; missing GL is not a reason
to reject a leaf or infer a code. Leaf classification still excludes hierarchy subtotal rows.
loadFinancialWorkbook(path, declaredBudgetOwner, importingActor): Promise<FinancialLoadReport>
returns batch identity, counts, monthly Debit/Credit/Actual/Budget/Roll-over reconciliations,
unknown/unmapped counts, rounding deltas, errors and activated flag. Define these in this module.

The CLI accepts --file, --budget-owner DUB and explicit operator identity through the existing
authorized operator context; never infer Plant from the filename. Exit nonzero on failure.
No public upload API is introduced by this stage; browser acceptance may use a test-only harness
calling this actual loader entry point on disposable data.

## Source layout and classification

Source: C:/Users/cawde/Downloads/5 Months Financial Data - Knack labs POC (1).xlsx.
Financial sheet: "5 Months Financial Data", header row 3; original inspected profile is 34,479
rows spanning Apr-Aug 2026. Treat this as a fixture expectation, not an unconditional hardcoded
constraint for later uploads. Headers include #, Transaction Number, Line_Id, Posting Date,
Month, Section, Plant, Cost Center, Considaration, MIS GL Code, MIS GL Name, Debit, Credit,
net, ShortName, ContraAct, LineMemo, Comments, Comments, Origin, Reference 1 and Loc.

Nursery sheet: "Nursery Fincail MIS " (trailing space), financial header near row 479, table
rows 481-588. Detect/check the financial table and monthly blocks; do not ingest operational
Nursery tables, annual/YTD blocks or workbook Actual/% as source facts. Classify leaf vs formula
subtotal from verified hierarchy/formula evidence, not merely a nonempty GL code.

## Tasks

### 3A: Parse every valid financial row

- [ ] Write parser cases retains_all_valid_rows_with_missing_dimensions, preserves_duplicate_comments,
      derives_month_from_date, rejects_invalid_money_or_date, rejects_duplicate_line_identity and
      preserves_negative_and_zero_lines. Keep blank vs numeric-zero distinctions.
- [ ] Normalize only approved Plant aliases (including DUB normalization where approved). Retain
      unknown original strings and raw row evidence; blank Plant stays unknown, blank Cost Center
      prevents mapping but does not discard valid money.
- [ ] Compare source Month and net with derived posting month and Debit-Credit as validation evidence;
      mismatches are reported, not silently allowed to overwrite the governed calculation.
- [ ] Parse decimal values without float summation. Preserve raw source precision; round each source
      money cell explicitly half-away-from-zero to two-decimal paise, report source-vs-rounded delta,
      and reconcile the sum of rounded cells exactly. Test negative half-paise and overflow.

### 3B: Parse Budget and validate mappings

- [ ] Write repeated_gl_stays_separate_leaf, formula_parent_not_fact, monthly_unpivot_retains_zero,
      missing_formula_cache_blocks_use, duplicate_component_identity_refuses_load and
      mapping_collision_refuses_load. Do not claim the earlier "95 GL rows" profile proved 95 leaves.
- [ ] Preserve serial/name/parent/order/Payment Office/rollover flag; form stable key from approved
      parent path + source serial + GL/name identity. A duplicate ambiguous identity fails.
- [ ] Read cached numeric monthly Budget/Roll-over only; require workbook recalculated/saved.
      A missing formula result is an error for this new path, not fabricated zero.
- [ ] Validate DUB owner, exactly-one target per Plant+Cost Center+GL and target leaf existence.
      Keep recorded provisional assignments provisional; structural consistency is not business approval.
- [ ] Mark known-Plant no-target lines Unmapped; retain Plant unknown for whole-load reconciliation.
      Do not copy DUB Budget to other Plants or infer correspondence by a similar component name.

### 3C: Reconcile and atomically activate

- [ ] Use stage 2 lifecycle: checksum/parser version identifies reruns; same valid file is idempotent,
      concurrent imports serialize, partial writes/failed validation leave prior active generation intact.
- [ ] Independently sum original row counts, Debit, Credit and Actual per month, including unknown
      Plants; compare persisted facts and explicitly account for every blank/rejected/duplicate row.
      A reject must not silently reduce a supposedly complete dataset.
- [ ] Independently sum Budget and closing Roll-over leaves per Plant/month. Record absent monthly
      coverage separately from loaded-zero. Compare source tree leaf sums to facts before activation.
- [ ] Follow decision 0054: the PoC CLI imports Actual coverage as unconfirmed; it has no
      business-completeness declaration workflow. Permit validated/reconciled activation without
      confirmation and prove that query/UI still show "Actual data not loaded" for complete
      Actual, never guessed zero. Preserve per-Plant/month coverage metadata for the governed
      reader; synthetic complete-coverage fixtures in disposable acceptance databases prove
      confirmed empty/nonempty cases without claiming real customer confirmation. Never expand
      all-known-Plants coverage or infer completeness from rows. A later confirmation process
      needs separate agreement, not a guessed input format now.
- [ ] Produce same-scope legacy comparison evidence with load/scope/inclusion rules recorded.
      Complete-source totals may exceed legacy retained-row totals; explain the rows, never force equality.
- [ ] Test loader failure halfway through writes, duplicate rerun, changed-file replacement, failed
      replacement and retry. Only reconciled facts become catalog/query available.

## Verification and handoff

- [ ] Run registered parser and loader proofs on disposable warehouse :5434. Independently check
      the real workbook via Decimal/source totals; do not generate expected values with the parser
      under test. Record actual row/leaf counts, source checksum and mapping limitations.
- [ ] Run standard quality/typecheck/structural/hermetic checks; inspect named leaves. No real
      financial rows or secrets committed to test fixtures/logs; synthetic fixtures cover edge cases.
- [ ] Hand off FinancialLoadReport, active generation/coverage and reproducible loader command.

**Done when:** The active PoC dataset preserves every valid financial line, has independently equal
source sums, explicit DUB Budget coverage and no duplicate rerun effects.
**Review focus:** Cached formula omissions; GL-bearing subtotal rows; source-vs-rounded mismatch;
unresolved dimensions silently skipped; successful-looking partial imports.
