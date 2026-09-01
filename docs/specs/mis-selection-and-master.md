---
slug: mis-selection-and-master
title: MIS selection & mapping master
status: confirmed
saved: 2026-09-01T10:08:34+00:00
---

# MIS selection & mapping master

## Why
Srihari's requirement is a parameterized generator: pick Department → Function →
Plant and get the right report, driven by a centralized master — never by the
source file name. The master is the config that resolves which cost centers, GL
codes, and format apply.

## Users
Any user generating an MIS; (later) an admin who maintains the mapping.

## Behaviour
- User selects **Department, Function, Plant, period** (e.g. Agriculture →
  Nursery → Agri–Nursery–DUB).
- A centralized **Mapping Master** resolves, for that selection: the applicable
  **Cost Centers + GL codes** and **which MIS format** to use.
- Transactions are validated by the composite key **Plant + Cost Center + GL**
  (the same GL spans Primary/Secondary — Srihari §4).
- Only the relevant slice is extracted and rendered in that format; combinations
  with no data still render (zero).
- Selection **never** depends on the Excel sheet or file name.

## Confirmed scope (grilled 2026-09-01)
- **Master table:** build a **provisional** master now, seeded from the SAP
  Entries Mapping sheet (+ the 7 missing GLs `50001701–706`, `50001905`);
  reconcile when Srihari sends his definition.
- **Editing:** maintained as **seed / config** for the PoC; an in-app admin editor
  is a later phase.
- **No mapping for a selection:** render an **empty statement (zeros) with a
  'no mapping configured' notice** (consistent with zero-rows).

## Rules
- Composite key Plant + Cost Center + GL is mandatory.
- The Mapping Master is the single source of selection/validation config.

## Out of scope (now)
- In-app authoring of the master or of brand-new MIS formats; non-nursery budgets.

## Acceptance criteria
- Selecting Agriculture/Nursery/DUB returns exactly the DUB nursery slice.
- Renaming the source file does not change the output.
- A selection with no mapping renders zeros + the notice (no crash).

## Open items (non-blocking)
- Srihari's authoritative **Master Table** structure — reconcile the provisional
  master against it (`docs/context/2026-09-01-srihari-requirements-qa.md` §6).

## Source
Decisions 0002, 0003; `docs/context/2026-09-01-srihari-requirements-qa.md` (§4–6).
