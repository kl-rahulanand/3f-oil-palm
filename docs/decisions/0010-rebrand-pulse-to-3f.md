---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-03
stories: [platform-base]
---

# Rebrand vendored product identifiers Pulse → 3F

## Context
The backend + contract were vendored from KnackLabs' Pulse (decision 0008), so the
running product still carries Pulse identifiers: the npm packages `@pulse/contract` and
`@pulse/backend` (and every import), the auth wire names (cookies `pulse_access` /
`pulse_refresh` / `pulse_csrf` and the JWT issuer/audience `pulse-api`), the seed display
name "Pulse Admin", the boot log "Pulse backend", the dev password `pulse-local`, and
help/glossary product strings. This is the 3F Oil Palm MIS product; it must not surface
"Pulse" anywhere in its own identity, and the fresh frontend (frontend-shell-login) should
consume 3F-named packages from the start. The user directed: "everything is 3F, no pulse."

## Decision
Do a **dedicated rebrand task** (its own branch + PR) BEFORE the frontend task that renames
every **product identifier** Pulse → 3F across the vendored backend + contract:
- npm package names `@pulse/contract` → `@3f/contract`, `@pulse/backend` → `@3f/backend`,
  and every import specifier + any tsconfig path mapping.
- auth **wire names**: cookies `pulse_*` → `3f_*` and the JWT issuer/audience `pulse-api` →
  a 3F value — set AND read consistently so the auth flow is unchanged in behaviour.
- seed display name "Pulse Admin" → "3F Admin"; boot log → 3F; dev password `pulse-local`
  → a 3F value; help/glossary product-name strings → 3F.

**Provenance is NOT rewritten.** Records that document where the code came from stay exactly
as they are — they are accurate history, not the product's identity:
`docs/decisions/0008-pulse-vendored-snapshot.md`, `backend/VENDORED_FROM`, and the
decision/plan/spec prose that says "vendored Pulse @ e639840". These are out of the rebrand
task's write_scope.

## Consequences
- A new `rebrand-pulse-to-3f` task is inserted into platform-base before `frontend-shell-login`
  (which now depends on it and consumes `@3f/contract`).
- The rename is behaviour-preserving: RBAC, sessions, audit, and OTP semantics are unchanged;
  only names change. The email+OTP login is re-verified end-to-end with the renamed cookies/JWT.
- Because cookie/JWT names change, any already-issued Pulse-named cookies/tokens are invalidated
  — acceptable (dev only; no production users).

## Related
- Decisions: 0006 (frontend fresh / backend-only vendor), 0008 (Pulse vendored snapshot).
- Spec: docs/specs/app-platform-base.md
