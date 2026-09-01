---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-01
stories: [platform-base]
---

# Frontend framework — Next.js (React) for the fresh 3F frontend

## Context
Decision 0006 builds the 3F frontend fresh from the approved Claude Design (the
KnackLabs `_ds` design system, exported as HTML/CSS/JS). We must pick the
framework for that fresh build.

## Decision
Build the fresh frontend with **Next.js (App Router) + React + TypeScript**, using
**shadcn/ui** components on **Tailwind CSS**, themed with the **KnackLabs `_ds`
design tokens** (the `_ds` palette/typography/spacing mapped into the Tailwind
theme), consuming the backend's REST API. When charts are needed (later stories),
use **recharts**.

shadcn/ui is the best fit: accessible Radix-based components we own in-tree (copied
in, not a black-box dependency), themed entirely through CSS variables — so the
`_ds` KnackLabs tokens drive every component, and there is no vendor design system
to fight.

Best fit because: the harness baseline is React; the Claude Design export is
plain HTML/CSS/JS that ports cleanly to React components over the `_ds` tokens;
Next.js gives routing, structure, and SSR-ready pages for a multi-screen data
app; and it matches the team's Pulse experience — while vendoring **no** Pulse
frontend code (decision 0006).

## Consequences
- One React/Next stack for every screen; `_ds` tokens drive the green theme.
- No Pulse-navy frontend legacy to fight.
- The frontend is a new workspace package alongside the vendored `backend` and
  `contract`.

## Related
- Decisions: 0003 (custom + Pulse), 0006 (frontend fresh / backend-only vendor)
- Design: `docs/design/3F-Financial-MIS/`
