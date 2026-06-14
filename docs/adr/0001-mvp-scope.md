# ADR 0001: MVP Scope

- Status: Accepted
- Date: 2026-06-13

## Context

The project needs enough behavioral structure to reconstruct knowledge-work
episodes without beginning with broad content capture or backend complexity.

## Decision

- Build a Chrome Manifest V3 extension in ambient, not task-bounded, mode.
- Gate capture on consent and provide visible pause/resume controls.
- Use an allowlist-first domain policy.
- Queue minimized events locally before any future upload.
- Target navigation, focus, search/LLM exposure, LLM source links, and
  downstream navigation.
- Permit explicit study-expanded response/snippet/URL events under baseline
  gates; broad or arbitrary text capture remains prohibited.
- Defer backend ingestion and research ETL.
- Use synthetic/demo data only; never commit real participant data.
- Mark IRB-dependent requirements `TODO` rather than asserting them.

## Consequences

The MVP prioritizes controllability and episode structure over content depth.
Site adapters and privacy filters become critical reviewed components. Future
upload, retention, text collection, and study procedures require separate
decisions.
