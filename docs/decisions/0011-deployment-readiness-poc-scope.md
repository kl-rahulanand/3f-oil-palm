---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-04
stories: [platform-base]
---

# Deployment readiness deferred to a post-PoC story; PoC acceptance is local + mock-OTP

## Context
platform-base is a **Proof of Concept** (decision 0001). The confirmed spec's phrase
"deploy-per-client" and "login works", read literally, imply a production-deployable
system, but nothing about production hosting has been scoped or built:

- Email OTP delivery runs in **mock** mode (`AUTH_OTP_MOCK`, code `000000`); real SES
  transport is not wired, and `config.ts` forbids mock OTP in production `NODE_ENV`.
- User **provisioning / roles**, **secret & config ownership**, the production
  **CORS/origin allowlist**, and the audit store's **access control, retention TTL,
  encryption, and data residency** are all TODO (see `audit.service.ts`), and the
  BRIEF records the client's NDA security/residency expectations as *still to confirm*.
- The constitution's monorepo standard expects a `/deployment/<environment>` structure
  (`constitution/01-monorepo-standard.md`); the vendored npm-workspace layout has none.

Treating any of this as in-scope would expand platform-base far beyond the PoC and the
frontend shell/login work in front of us. Confirmed with the client 2026-09-04.

## Decision
**PoC acceptance is local + mock-OTP + a Postgres query end-to-end** — the app builds,
boots, authenticates via mock OTP, renders the 3F shell, and runs a trivial warehouse
query against a local Postgres. **All production deployment-readiness concerns are
deferred to a dedicated post-PoC "deployment readiness" story** and are explicitly out
of scope for platform-base:

- real email/OTP delivery (SES) and non-mock `NODE_ENV=production` auth;
- user provisioning and role administration;
- secret/config ownership and the production CORS/origin allowlist;
- audit-event access control, retention/deletion TTL, and encryption at rest;
- data residency guarantees per the client NDA;
- the `/deployment/<environment>` structure and any hosting/CD pipeline.

## Consequences
- The confirmed spec (`docs/specs/app-platform-base.md`) and the architecture build plan
  (`docs/architecture/30-financial-mis-build-plan.md`) are reconciled to state the PoC
  acceptance and mark production readiness deferred, rather than implying it is delivered.
- A deferral row (`forge defer add`) tracks the deployment-readiness story with a revisit
  trigger (the PoC is accepted and a production pilot is scheduled).
- No production auth/data-handling code is written in platform-base; the frontend and
  backend target the local + mock-OTP profile.

## Related
- Decisions: 0001 (PoC scope), 0006 (frontend fresh / backend-only vendor), 0008
  (vendored snapshot), 0010 (rebrand). Spec: docs/specs/app-platform-base.md.
