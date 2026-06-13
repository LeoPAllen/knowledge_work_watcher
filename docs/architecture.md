# Architecture

## Current State

Documentation only. No application code, telemetry, backend, or ETL exists.

## Planned Components

1. **Chrome Manifest V3 extension**
   - Runs in ambient mode rather than around a declared task.
   - Exposes consent state and visible pause/resume controls.
   - Applies an allowlist-first domain policy before parsing.
2. **Site adapters**
   - Produce minimal structured events for explicitly supported search and LLM
     domains.
   - Avoid broad DOM or page capture.
3. **Privacy filter**
   - Rejects excluded domains and sensitive fields.
   - Minimizes and validates events before persistence.
4. **Local queue**
   - Stores validated events before any future upload.
   - Retention, encryption, and deletion behavior are `TODO` pending study and
     IRB requirements.
5. **Backend ingestion**
   - Deferred until after the extension MVP and an explicit security review.
6. **Research ETL**
   - Deferred; will operate on approved, versioned event contracts.

## Event Flow

`browser signal -> allowlist check -> site adapter -> privacy filter -> local queue`

Future upload must be separately consented, authenticated, and documented.

## Boundaries

- No private-domain capture.
- No password, form-field, cookie, or token capture.
- No optional text capture without a later explicit decision.
- Synthetic/demo data only in this repository.
