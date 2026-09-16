# Running the PoC on EC2

A **demo** deployment: one instance, four containers, mock OTP. Read
"What this is not" before showing it to anyone outside the team.

## Prerequisites

Docker Engine with the Compose plugin, and an EC2 security group that allows
inbound **3000** and **4000** from wherever you will browse from. Both ports,
not just 3000 — the browser calls the backend directly.

## Run it

From the **repository root**, not from this directory:

```bash
cp deployment/ec2/.env.example deployment/ec2/.env
chmod 600 deployment/ec2/.env
```

Edit `deployment/ec2/.env`. The three that catch people out:

- `NEXT_PUBLIC_API_BASE_URL` and `FRONTEND_ORIGIN` must both be the instance's
  **public** address. Not `localhost`, not a container name — the browser
  resolves them, and it is outside Docker.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_MODEL_ID`. Without
  them, set `LLM_PROVIDER=mock` and the app still runs, but Ask will answer
  every question with a clarification, because that is all the mock provider
  ever returns. It will look broken.
- `STATEMENT_ATTESTATION_SECRETS` is **required** and has no default — the
  backend throws `STATEMENT_ATTESTATION_SECRETS is required` at boot and the
  container never starts. That is deliberate: a development fallback would mean
  silently unsigned statement contexts, which defeats the check. Generate one
  with `openssl rand -hex 32`. Several keys may be listed separated by `;` — the
  first signs, any listed key verifies, so you can rotate without invalidating
  statements already open in a browser.

Then:

```bash
docker compose -f deployment/ec2/docker-compose.yml --env-file deployment/ec2/.env up -d --build
```

Sign in at `http://YOUR_EC2_PUBLIC_IP:3000` as `admin@example.invalid`, OTP
`000000`.

## Loading data

The warehouse starts empty, so every answer will be honest and empty. Load the
SAP actuals and the budget workbook through **Admin -> Ingest** in the app, the
same way the local PoC was loaded.

## What this is not

Decision **0011** defers production deployment readiness to its own story, and
this does not close it. Specifically still missing:

- **Real OTP delivery.** Mock OTP means anyone who can reach port 3000 signs in
  as the seeded admin with `000000`. The backend only listens on a network
  interface because the compose file sets `BIND_HOST=0.0.0.0`, switching off a
  guard that exists for exactly this reason (decision **0029**). **The security
  group is the only control.** Restrict it to your own IP.
- **HTTPS.** Everything is plain HTTP, so session cookies travel in clear text.
- **`NODE_ENV=production`.** Deliberately not set: `backend/src/config.ts:118`
  refuses to start a production build with mock OTP, and no real OTP transport
  is wired — a production-mode container could authenticate nobody. Setting it
  without wiring SES will simply crash the backend on boot.
- Secret ownership, the production CORS allowlist, audit retention and
  encryption, and data residency — all per decision 0011.

## Things that will bite you

**Changing the API URL needs a rebuild, not a restart.** Next inlines
`NEXT_PUBLIC_*` at build time (`frontend/src/lib/api.ts:27`), so it is a build
argument. After changing it:

```bash
docker compose -f deployment/ec2/docker-compose.yml --env-file deployment/ec2/.env up -d --build frontend
```

**The two databases are separate on purpose.** `backend/src/config.ts:228`
refuses to start when the warehouse resolves to the same address as the
application database on the same port. Collapsing `db` and `warehouse-db` into
one service will not boot.

**Migrations run as their own one-shot service.** `backend` waits for `migrate`
to exit successfully, so a migration failure stops the app from starting rather
than leaving it half-configured. Read it with:

```bash
docker compose -f deployment/ec2/docker-compose.yml logs migrate
```

**The backend listens on a network only because we told it to.** Unset
`BIND_HOST` and it returns to loopback-only under mock OTP, which is the safe
default and also means the container accepts no connections at all. If the
backend seems up but nothing can reach it, that is the first thing to check.

**A `t3.micro` will struggle.** The image build runs three TypeScript builds and
a Next production build in one step; give it 4 GB of RAM, or build elsewhere and
push to a registry.
