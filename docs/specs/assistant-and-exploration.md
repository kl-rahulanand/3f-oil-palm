---
slug: assistant-and-exploration
title: Assistant & exploration
status: draft
saved: 2026-09-01T09:20:13+00:00
---

# Capability: Assistant & exploration

## Summary
A trustworthy natural-language assistant plus self-serve exploration over the same
governed semantic layer (adapted from Pulse).

## Users
Finance / management asking ad-hoc questions; analysts exploring beyond the fixed MIS.

## Behaviour
- Ask questions in **natural language** → a **verified answer + chart**, grounded
  in the governed measures, with **provenance** ("how this was calculated") and a
  **"view in report"** link.
- Two surfaces: a **docked assistant** beside the report and a **standalone Ask
  page** with conversation history.
- **Saved queries + pinned dashboards** for self-serve exploration.

## Rules
- The LLM **selects** from the semantic layer; it never authors SQL.
- RBAC + append-only audit apply to every answer; residency-safe (self-hosted,
  our own model key).

## Out of scope (now)
- Open-ended causal "why"; the exact docked-panel placement is a nice-to-have,
  not a gate.

## Acceptance signals
- An NL question returns a verified, provenanced answer that matches the report.
- A saved report re-runs correctly under the current user's RBAC.

## Source
Decision 0003; Pulse README (Metabot, saved queries, pin-to-dashboard).
