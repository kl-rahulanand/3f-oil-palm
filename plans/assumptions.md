# Implementation Assumptions Ledger

One row per assumption made during implementation (`forge plan assume`).
The orchestrator reviews open rows and guides:
`./forge assumptions resolve <id> --status confirmed|fix-needed|promoted --notes "..."`.
`pr_ready.py` refuses while the task has rows at `open` or `fix-needed`.

| id | date | issue | assumption | status | guidance |
|----|------|-------|------------|--------|----------|
| A-0001 | 2026-09-09 | sap-ingestion | Use ExcelJS's existing JSZip dependency as a direct backend dependency to stream-check XLSX entry count and decompressed bytes before ExcelJS materializes the workbook. | open |  |
| A-0002 | 2026-09-09 | sap-ingestion | The pre-materialization XLSX guard rejects ZIP64 archives, caps raw header columns at 256, and allows at most 256 serialized non-data worksheet rows beyond the 25,000-row data limit; the supplied SAP workbook is far below each bound. | open |  |
