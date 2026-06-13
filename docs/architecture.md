# Architecture

## Current State

A minimal extension exists under `extension/`. It includes Manifest V3 controls,
local persistence, a URL privacy filter, minimized navigation telemetry, and
scoped search, LLM, and knowledge-site parsers. An MVP Fastify API validates
events and stores them append-only in local SQLite. The extension does not
upload unless the participant enables sync. Local ETL validates and sessionizes
synthetic JSONL or SQLite events into analysis-ready CSV tables.

## Extension Layout

- `extension/manifest.json`: MV3 with storage and webNavigation permissions
- `extension/src/background/`: service worker and telemetry controller
- `extension/src/background/upload-sync.mjs`: gated batching and retry control
- `extension/src/search/`: scoped content script and engine parsers
- `extension/src/llm/`: scoped content script and tool parsers
- `extension/src/knowledge/`: metadata-only knowledge-site parsers
- `extension/src/popup/`: capture-status popup
- `extension/src/options/`: local consent, configuration, and debug controls
- `extension/src/config/`: readable default domain policy
- `extension/src/shared/`: state, filtering, identifiers, schema, and storage
- `extension/scripts/`: dependency-free policy checks
- `backend/src/`: API, auth, validation, configuration, and SQLite storage
- `backend/tests/`: synthetic endpoint and persistence tests
- `research-etl/`: validation, sessionization, transforms, fixtures, and tests

## Planned Components

1. **Chrome Manifest V3 extension**
   - Runs in ambient mode rather than around a declared task.
   - Exposes consent state and visible pause/resume controls.
   - Applies an allowlist-first domain policy before local capture.
2. **Site adapters**
   - Search adapters produce minimal structured events for three named domains.
   - LLM adapters produce prompts, metadata, and source links without responses.
   - Knowledge adapters expose titles/headings and structured public metadata.
   - Avoid broad DOM or page capture.
3. **Privacy filter**
   - Classifies URLs as allowed, denied, private/sensitive, unsupported, or
     invalid before telemetry or any future adapter runs.
   - Applies deny and sensitive rules before default or custom allowlists.
4. **Local queue**
   - Stores validated events until backend acknowledgement.
   - Keeps metadata-only rejection records in a local dead-letter queue.
   - Retention, encryption, and deletion behavior are `TODO` pending study and
     IRB requirements.
5. **Backend ingestion**
   - Accepts authenticated schema v1 single or batch event requests.
   - Adds request ID/receive time and stores immutable raw event JSON in SQLite.
   - Uses a shared study token placeholder; production auth remains deferred.
6. **Research ETL**
   - Reads version 1 JSONL or SQLite events and fails closed on quality checks.
   - Writes deterministic clean, exposure, episode, navigation, and trace CSVs.

## Event Flow

`signal -> consent/filter -> minimization -> local queue`

`active upload -> bearer auth -> validation -> append-only SQLite`

`JSONL/SQLite -> quality checks -> sessionization -> derived CSV tables`

Upload is off by default and stops while paused or after consent revocation.

## Boundaries

- No private-domain capture.
- No password, form-field, cookie, or token capture.
- No optional text capture without a later explicit decision.
- Synthetic/demo data only in this repository.
