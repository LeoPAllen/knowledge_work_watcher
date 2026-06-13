# Implementation Plan

## 0. Documentation Scaffold

- Record architecture, privacy boundaries, event intent, and review rules.
- Add no code, dependencies, telemetry, backend, or ETL.

## 1. Extension Shell

- Create a Chrome Manifest V3 extension with minimal permissions.
- Add consent-gated capture state and visible pause/resume controls.
- Implement allowlist configuration and private-domain rejection.
- Use synthetic/demo inputs only.

## 2. Local Event Pipeline

- Define typed, versioned event envelopes.
- Add URL minimization, privacy filters, and schema validation.
- Add a local queue with explicit inspection and deletion controls.
- Test parsers and filters with synthetic positive and negative cases.

## 3. Allowlisted Adapters

- Add narrow search-domain adapters.
- Add narrow LLM-domain adapters.
- Record exposure and downstream navigation without broad page capture.
- Keep optional text capture disabled.

## 4. Study Readiness

- `TODO(IRB)`: finalize consent, retention, deletion, and approved fields.
- Complete privacy, permissions, and threat-model reviews.
- Add export/diagnostic tooling that cannot expose sensitive content.

## 5. Local Ingestion

- Validate authenticated schema v1 events at a bounded HTTP interface.
- Store accepted raw events append-only in local SQLite.
- Keep extension upload and production deployment deferred.

## Deferred

- Extension upload and production authentication
- Research ETL and episode reconstruction
- Production deployment and participant enrollment
