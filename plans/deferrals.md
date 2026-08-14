# Deferral Ledger

Deliberately-removed scope with explicit revisit triggers (`forge defer add`).
When a trigger fires, the item goes back on the roadmap and its row is
resolved: `./forge defer resolve <id> --notes "<what happened>"`.

| id | added | item | why deferred | trigger to revisit | status |
|----|-------|------|--------------|--------------------|--------|
| D-0001 | 2026-08-14 | Detecting/flagging upstream manual manipulation of Yield-per-hectare and OER inside Smart Palm/SAP (accuracy layer, not just recompute-from-source) | Client scoped it out for the PoC (2026-08-14). Manipulation is upstream in the source systems, so a read-only recompute inherits the values; client chose to ship the automated, live, drill-down MIS + chatbot first and address accuracy later. | Client asks to trust/certify the metrics, OR a ground-truth reference (Smart Palm audit trail, weighbridge/mill raw capture, or independent lab OER) becomes available, OR drill-down surfaces manipulation the client wants flagged | open |
