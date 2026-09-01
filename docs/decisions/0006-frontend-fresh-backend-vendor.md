---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-01
stories: []
---

# Frontend built fresh from the approved design; vendor Pulse backend only

## Context
`app-platform-base` (confirmed) described vendoring Pulse's full app and reskinning
its Next.js frontend navy→green. Refined direction: build the **frontend fresh** to
match the **approved Claude Design** export (`docs/design/3F-Financial-MIS`, the
KnackLabs `_ds` design system + the MIS screens/flows), using strong frontend
craft — and vendor **only Pulse's backend (+ shared contract types)**, not its
frontend.

## Decision
- **Vendor Pulse backend (NestJS) + `contract`** only — the trust spine: auth,
  RBAC, sessions, semantic layer, SQL builder/validator, warehouse seam, audit.
  **Do not vendor Pulse's Next.js frontend.**
- **Build the frontend fresh** to the approved Claude Design (KnackLabs green
  design system + the designed MIS screens), consuming the backend's REST API,
  using best frontend practices (e.g. the `frontend-design` / `emil-design-eng`
  skills).
- This refines `app-platform-base` (supersedes its "vendor frontend + reskin"
  line); the capability outcome (running, green-branded, Postgres-backed,
  OTP-auth app) is unchanged.

## Consequences
- More frontend build effort than reskinning Pulse's UI, but a **design-faithful,
  fully-owned** frontend with no Pulse-navy legacy to fight.
- The fresh frontend consumes Pulse's backend API; shared types come from the
  vendored `contract` package.
- The OTP login UI is rebuilt in the new frontend against Pulse's existing auth
  endpoints.

## Related
- Spec: `docs/specs/app-platform-base.md`; Design: `docs/design/3F-Financial-MIS/`
- Decisions: 0003 (custom + Pulse), 0004 (governed joins)
