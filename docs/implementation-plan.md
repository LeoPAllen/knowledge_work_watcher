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
- Keep production deployment deferred.

## 6. Extension Sync

- Batch queued events only during consented, active ambient capture.
- Preserve failures, dead-letter explicit rejections, and retry with backoff.
- Require explicit upload enablement and exact runtime server permission.

## 7. Research ETL

- Validate versioned JSONL or SQLite input before transformation.
- Sessionize by participant/session and bounded inactivity.
- Export deterministic synthetic CSV tables with privacy quality checks.

## MVP Verification Status

- Automated synthetic E2E covers queue, authenticated HTTP batch upload,
  append-only SQLite, ETL outputs, privacy assertions, and extension packaging.
- Chrome unpacked loading, controls, runtime permission, and live selectors
  remain explicit manual checks before a study build.
- No real participant data, production deployment, or study enrollment is
  included.

## Deferred

- Production authentication and deployment
- Production deployment and participant enrollment
