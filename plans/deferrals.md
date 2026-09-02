# Deferral Ledger

Deliberately-removed scope with explicit revisit triggers (`forge defer add`).
When a trigger fires, the item goes back on the roadmap and its row is
resolved: `./forge defer resolve <id> --notes "<what happened>"`.

| id | added | item | why deferred | trigger to revisit | status |
|----|-------|------|--------------|--------------------|--------|
| D-0001 | 2026-08-14 | Detecting/flagging upstream manual manipulation of Yield-per-hectare and OER inside Smart Palm/SAP (accuracy layer, not just recompute-from-source) | Client scoped it out for the PoC (2026-08-14). Manipulation is upstream in the source systems, so a read-only recompute inherits the values; client chose to ship the automated, live, drill-down MIS + chatbot first and address accuracy later. | Client asks to trust/certify the metrics, OR a ground-truth reference (Smart Palm audit trail, weighbridge/mill raw capture, or independent lab OER) becomes available, OR drill-down surfaces manipulation the client wants flagged | open |
| D-0002 | 2026-09-02 | contract/test/auth-contract.test.ts is not runnable in this repo (imports ../src/index.ts with a .ts extension, which needs allowImportingTsExtensions; the file is excluded from build via include=src/**/* and no test script runs it) | Pre-existing vendored state, orthogonal to the MBS-fixture leak fixed in this task; wiring contract tests into a runnable script is the harness-wiring task's concern, not the vendor task's bounded scope | harness-wiring (task 5) wires test/lint scripts, OR contract tests are added/relied upon as a gate | open |
