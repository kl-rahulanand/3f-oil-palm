---
name: ask-multi-plant-live-check
description: The post-change live check of ASK-MULTI-PLANT Done-when 10 (2026-10-05) against the pre-change probe; 5 of 5 success questions, 3 runs each, probe answers unchanged.
metadata:
  type: project
---

Run by the coordinator on 2026-10-05 against master at the merge of #115 (this story's parts #98-#110,
plus fixes #111, #112, #113 and #115), live Bedrock, the July 2026 warehouse with migration 0004 applied,
backend on port 4001, mock OTP. Each question in a fresh conversation, each run 3 times; every figure
below was the same on all 3 runs and was checked against the warehouse or the per-plant answers.

## Success measure (spec `ask-multi-plant.md`), as the seeded admin (31 plants)

| # | Question | Steps | Result | Check |
| - | --- | --- | --- | --- |
| 1 | Which GL codes had Actual over Budget in July 2026? | plant picker, chose DUB | 21 GL codes, Actual 1,08,06,145.73 against Budget 82,34,666.97; 50001201 at 83,98,339.00 (Budget 80,00,000.00) | matches the pre-change probe |
| 2 | Actual by plant for July 2026 | plant picker, chose All plants | 31 rows, total 11,02,73,718.00 | equals the warehouse's July `actual_by_gl_month` sum over all plants |
| 3 | What was the Actual for each MIS statement line in July 2026 for DUB and CHIR? | no picker (plants named) | one combined statement, all 81 lines, total 1,21,93,273.96 | every line equals DUB's line plus CHIR's line to the paisa (0 mismatches over 81 keys); DUB 1,15,12,712.07 + CHIR 6,80,561.89 |
| 4 | Actual, Budget and % by GL code for July 2026 for CHIR | no picker | 17 CHIR GL rows, Actual 6,80,561.89; Budget and % columns present, all 17 rows "not-loaded" with null Budget and % | CHIR has no loaded budget |
| 5 | What was the Actual for each MIS statement line in July 2026? | plant picker, chose DUB | 81 DUB statement lines, 80 labelled, total 1,15,12,712.07 | the unlabelled line is `unmapped-GL`, as before this story |

Result: 5 of 5 on every run (target 5 of 5); no plant-scope refusal for any reader holding plants.

## Pre-change probe re-run (plan Notes, 2026-10-04)

The admin now gets the plant picker on the first three (the probe's admin answers were DUB-only while
listing every plant); choosing DUB reproduces the pre-change selection. Each question below returned the
same full normalised selection on all 3 runs. In every one the domain and measures match the probe, the
month filter the selector sent was normalised away (no ordinary filter remains), the period is
July 2026 (`{grain: "day", column: "month", from: "2026-07-01", to: "2026-07-31"}`), and the only
filter is the server's plant filter.

| Question | Domain | Measures | Dimensions | Filters | Measure filters | Rows | Probe rows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| show me list items where Actuals are more than the budget for July 2026 | governed-financial | actual, budget | gl_code | plant in [DUB] | actual > budget | 21 | 21 |
| which GL codes spent more than 5 lakh in July 2026 | governed-financial | actual | gl_code | plant in [DUB] | actual > 500000.00 | 2 (total 89,52,532.00) | 2 |
| Actual by GL code for July 2026 | governed-financial | actual | gl_code | plant in [DUB] | none | 67 (total 1,15,12,712.07) | 67 |
| which statement lines are over budget for July 2026 (DUB-only user, no picker) | mis-statement | actual_net, budget_net | leaf_key | plant in [DUB] | actual_net > budget_net | 14 | 14 |

## Full selections of the success questions (identical on all 3 runs)

| # | Domain | Measures | Dimensions | Filters | Measure filters | Period |
| - | --- | --- | --- | --- | --- | --- |
| 1 | governed-financial | actual, budget | gl_code | plant in [DUB] | actual > budget | July 2026 |
| 2 | governed-financial | actual | plant | plant in all 31 granted plants | none | July 2026 |
| 3 | mis-statement | actual_net | leaf_key | plant in [CHIR, DUB] | none | July 2026 |
| 4 | governed-financial | actual, budget, percentage | gl_code | plant in [CHIR] | none | July 2026 |
| 5 | mis-statement | actual_net | leaf_key | plant in [DUB] | none | July 2026 |

## Observations carried forward

- Before #115, question 3's selector added a measure filter "Actual greater than 0.00" on 3 of 4
  runs, so the combined statement listed only its 22 non-zero lines. #115 keeps an amount comparison
  only when the question states the amount, and on this run question 3 listed all 81 lines on every
  run with no measure filter.
- Post-merge QA findings that remain open are in the coordinator's QA notes of 2026-10-05; the period
  rule for Actual-versus-Budget questions with no period is being amended in
  `docs/specs/ask-period-control.md`.
