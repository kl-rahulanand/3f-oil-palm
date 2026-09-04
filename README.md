# 3oilpalm — 3F Oil Palm Financial MIS

An automated, live Management Information System (MIS) for 3F Oil Palm. It puts a
single trusted, **read-only** reporting layer over 3F's two source systems (SAP +
the Smart Palm SQL Server) and reports the headline metrics — Yield per hectare
and OER — live, with clickable drill-downs so any number can be traced back to the
source rows that produced it. A conversational (chatbot) layer over the same
centralized data is sequenced as a fast-follow. The full product intent lives in
[`docs/product/BRIEF.md`](docs/product/BRIEF.md); the data model and build plan are
under [`docs/architecture/`](docs/architecture/).

The application is vendored and adapted from KnackLabs' internal product and fully
rebranded to 3F (decision [0010](docs/decisions/0010-rebrand-pulse-to-3f.md)); no
product identifier surfaces anything but **3F** — the accurate vendor-origin history
is preserved separately in `backend/VENDORED_FROM` and decision
[0008](docs/decisions/0008-pulse-vendored-snapshot.md).

## Application layout

An npm workspace (`contract`, `backend`; the frontend is next):

| Package        | What it is                                                              |
| -------------- | ---------------------------------------------------------------------- |
| `@3f/contract` | Shared TypeScript API/domain types consumed by the backend (and, next, the frontend). |
| `@3f/backend`  | NestJS backend — email + OTP auth, RBAC, append-only audit, and a governed Postgres warehouse adapter over the source data. |

### Running the backend locally

Two Postgres services back the app (see [`docker-compose.yml`](docker-compose.yml)):
the **app DB** (`threef`, port `5432`) holds auth/audit; the **warehouse DB**
(`warehouse`, port `5433`) holds the reporting data.

```bash
docker compose up -d app-db warehouse-db     # start Postgres
npm install                                  # install workspace deps
npm run build                                 # build @3f/contract then @3f/backend
npm run db:migrate                            # apply auth + audit migrations to the app DB
npm run dev:backend                           # start the NestJS backend (Swagger: "3F API")
```

Auth is email + OTP. For local dev, `AUTH_OTP_MOCK` accepts code `000000`; a
successful login sets the `3f_access` / `3f_refresh` / `3f_csrf` cookies (JWT issuer
`3f-api`, audience `3f`) and seeds a "3F Admin" user.

## Working in this repo — Symphony Forge

This repo runs on the [Symphony Forge](https://github.com/knacklabs/symphony-forge)
engineering harness: agents do the mechanical work, deterministic gates keep
the evidence honest, and humans make the decisions. Getting started is
conversational — open an agent session (Claude Code or Codex) in the repo
root, then:

- **The session checks your machine every time.** If tools are missing it
  says so on the spot — reply "set up my machine" and approve the installs;
  only logins stay manual.
- **Ask "what now?" whenever you are unsure.** The harness answers with the
  current phase and the exact next step. There is nothing to memorize.
- **Every feature starts with a plan the agent must defend.** Product writes
  require plan mode and an approved plan, or an explicit five-file quickfix;
  planned work then runs stage by stage with a local review
  before every commit, and shipping refuses until the evidence gates pass.
- **The map:** `AGENTS.md` is the contract and read order, `WORKFLOW.md` the
  doctrine, `docs/product/BRIEF.md` what this product is. Standards that are
  law live in `docs/architecture/` and `docs/decisions/`.
- **Humans own** accepting decisions, client sign-off, and merging PRs —
  agents draft and relay, never run those.

The vendored harness machinery (`factory/`, `constitution/`, gate scripts)
is frozen: never edit it here — improvements go to the harness repo and
arrive by re-vendoring.
