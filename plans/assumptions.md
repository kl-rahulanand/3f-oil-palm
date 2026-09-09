# Implementation Assumptions Ledger

One row per assumption made during implementation (`forge plan assume`).
The orchestrator reviews open rows and guides:
`./forge assumptions resolve <id> --status confirmed|fix-needed|promoted --notes "..."`.
`pr_ready.py` refuses while the task has rows at `open` or `fix-needed`.

| id | date | issue | assumption | status | guidance |
|----|------|-------|------------|--------|----------|
| A-0001 | 2026-09-09 | sap-ingestion | Use ExcelJS's existing JSZip dependency as a direct backend dependency to stream-check XLSX entry count and decompressed bytes before ExcelJS materializes the workbook. | open |  |
