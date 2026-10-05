---
name: ask-multi-plant-live-check
description: The post-change live check of ASK-MULTI-PLANT Done-when 10 (2026-10-05) against the pre-change probe; 5 of 5 success questions, 3 runs each, probe answers unchanged.
metadata:
  type: project
---

Run by the coordinator on 2026-10-05 against master at the merge of #113 (this story's parts #98-#110,
plus fixes #111, #112 and #113), live Bedrock, the July 2026 warehouse with migration 0004 applied,
backend on port 4001, mock OTP. Each question in a fresh conversation, each run 3 times; every figure
below was the same on all 3 runs and was checked against the warehouse or the per-plant answers.

## Success measure (spec `ask-multi-plant.md`), as the seeded admin (31 plants)

| # | Question | Steps | Result | Check |
| - | --- | --- | --- | --- |
| 1 | Which GL codes had Actual over Budget in July 2026? | plant picker, chose DUB | 21 GL codes, Actual 1,08,06,145.73 against Budget 82,34,666.97; 50001201 at 83,98,339.00 (Budget 80,00,000.00) | matches the pre-change probe |
| 2 | Actual by plant for July 2026 | plant picker, chose All plants | 31 rows, total 11,02,73,718.00 | equals the warehouse's July `actual_by_gl_month` sum over all plants |
| 3 | What was the Actual for each MIS statement line in July 2026 for DUB and CHIR? | no picker (plants named) | one combined statement, 22 lines, total 1,21,93,273.96 | every line equals DUB's line plus CHIR's line to the paisa (0 mismatches over 81 keys); DUB 1,15,12,712.07 + CHIR 6,80,561.89 |
| 4 | Actual, Budget and % by GL code for July 2026 for CHIR | no picker | 17 CHIR GL rows, Actual 6,80,561.89; Budget and % columns present, all 17 rows "not-loaded" with null Budget and % | CHIR has no loaded budget |
| 5 | What was the Actual for each MIS statement line in July 2026? | plant picker, chose DUB | 81 DUB statement lines, 80 labelled, total 1,15,12,712.07 | the unlabelled line is `unmapped-GL`, as before this story |

Result: 5 of 5 on every run (target 5 of 5); no plant-scope refusal for any reader holding plants.

## Pre-change probe re-run (plan Notes, 2026-10-04)

The admin now gets the plant picker on these (the probe's admin answers were DUB-only while listing
every plant); choosing DUB reproduces the pre-change selection and rows.

| Question | Before | After (DUB chosen) |
| --- | --- | --- |
| show me list items where Actuals are more than the budget for July 2026 | Actual and Budget, `gl_code`, Actual > Budget, 21 rows | same, 21 rows |
| which GL codes spent more than 5 lakh in July 2026 | Actual, `gl_code`, Actual > 500000.00, 2 rows | same, 2 rows, total 89,52,532.00 |
| Actual by GL code for July 2026 | Actual, `gl_code`, 67 rows | same, 67 rows, total 1,15,12,712.07 |
| which statement lines are over budget for July 2026 (DUB-only user, no picker) | Actual and Budget, `leaf_key`, Actual > Budget, 14 rows | same, 14 rows |

## Observations carried forward

- A combined statement for several plants lists only the lines with a non-zero Actual (22), while a
  one-plant statement lists every mapped line (81) including zeros. The totals and every listed line
  are correct; the difference is presentation only.
- Post-merge QA findings that remain open are in the coordinator's QA notes of 2026-10-05; the period
  rule for Actual-versus-Budget questions with no period is being amended in
  `docs/specs/ask-period-control.md`.
