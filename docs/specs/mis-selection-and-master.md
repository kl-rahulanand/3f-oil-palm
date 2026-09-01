---
slug: mis-selection-and-master
title: MIS selection & mapping master
status: draft
saved: 2026-09-01T09:20:13+00:00
---

# Capability: MIS selection & mapping master

## Summary
A parameterized selection (Department → Function → Plant → period) that resolves
the right report from a centralized Mapping Master — independent of source file
names.

## Users
Any user generating an MIS; an admin who maintains the mapping.

## Behaviour
- User selects **Department, Function, Plant, period** (e.g. Agriculture →
  Nursery → Agri–Nursery–DUB).
- A centralized **Mapping Master** resolves, for that selection: the applicable
  **Cost Centers + GL codes**, and **which MIS format** to use.
- Transactions are validated by the composite key **Plant + Cost Center + GL**.
- Only the relevant slice is extracted and rendered in that format; combinations
  with no data still render (zero).
- The system **never** infers Department/Function/Plant from the Excel sheet or
  file name.

## Rules
- Composite key is mandatory — the same GL code spans Primary/Secondary, so Cost
  Center + Plant disambiguate (Srihari §4).
- The Mapping Master is the single source of selection/validation config and is
  admin-editable.

## Out of scope (now)
- UI authoring of brand-new MIS formats; non-nursery plants' budgets.

## Acceptance signals
- Selecting Agriculture/Nursery/DUB returns exactly the DUB nursery slice.
- Renaming the source file does not change the output.

## Open
- The **Master Table** column/key structure — Srihari's definition arrived
  cut off (`docs/context/2026-09-01-srihari-requirements-qa.md` §6).
