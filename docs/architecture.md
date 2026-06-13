# Architecture

## Current State

A minimal extension shell exists under `extension/`. It includes a Manifest V3
service worker, popup, and options page, but no telemetry, persistence,
permissions, content scripts, backend, or ETL.

## Extension Layout

- `extension/manifest.json`: zero-permission MV3 declaration
- `extension/src/background/`: inert service worker
- `extension/src/popup/`: capture-status popup
- `extension/src/options/`: disabled configuration placeholders
- `extension/src/shared/`: shared presentation styles
- `extension/scripts/`: dependency-free policy checks

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
