---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-15
stories: [ask-period-control]
---

# Exposing the backend on a network is an explicit setting, not a side effect

## Context
`backend/src/main.ts` bound `127.0.0.1` whenever `AUTH_OTP_MOCK` was set. That is a
real guard, not an accident: with mock OTP, **anyone who can reach the app signs in as
the seeded admin with `000000`**, so the server refuses to listen on a network
interface at all.

It also makes the PoC impossible to containerise. Docker's port publisher cannot reach
a process listening on the container's own loopback, so a containerised backend accepts
no connections - verified: the stack came up healthy, migrations completed, the
frontend served, and the backend answered nothing.

Turning mock OTP off does not help. `SesEmailService.sendOtp` throws
("SES OTP email transport is not enabled"), so with the guard satisfied nobody can
receive a code and nobody can log in. Decision **0011** deferred real OTP delivery, and
this is where that deferral bites.

The client asked twice for a single-command deployment on EC2 and was told plainly what
it exposes.

## Decision
The listen interface becomes an explicit setting, `BIND_HOST`.

- **Unset, nothing changes.** Mock OTP still means loopback only. No existing
  deployment, script or developer machine behaves differently.
- **Set, it wins.** `deployment/ec2/docker-compose.yml` sets `BIND_HOST=0.0.0.0` in one
  visible place, next to a comment saying what it costs.
- **Blank is not a value.** `BIND_HOST=` or whitespace falls back to the guard, so a
  stray line in an env file cannot silently publish a mock-OTP instance.

The exposure is therefore a choice someone made and can be grepped for, rather than a
consequence of which container runtime you happened to use.

## Consequences
- The EC2 demo is reachable at `http://<instance>:3000` and **anyone who reaches it is
  the admin**. The security group is the only control; the README says so.
- No HTTPS, so session cookies travel in clear text. `secure` is only set under
  `NODE_ENV=production`, which this deployment cannot use.
- Decision **0011** is NOT closed. Real OTP delivery, secret ownership, the production
  CORS allowlist, audit retention and encryption, and data residency all remain
  deferred to the deployment-readiness story.
- When that story lands and mock OTP is off, `BIND_HOST` becomes unnecessary: the
  server binds all interfaces on its own, legitimately.
