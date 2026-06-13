# Architecture

## Current State

A minimal extension exists under `extension/`. It includes Manifest V3 controls,
local persistence, a URL privacy filter, minimized navigation telemetry, and
scoped search, LLM, and knowledge-site parsers. It has no backend or ETL.

## Extension Layout

- `extension/manifest.json`: MV3 with storage and webNavigation permissions
- `extension/src/background/`: service worker and telemetry controller
- `extension/src/search/`: scoped content script and engine parsers
- `extension/src/llm/`: scoped content script and tool parsers
- `extension/src/knowledge/`: metadata-only knowledge-site parsers
- `extension/src/popup/`: capture-status popup
- `extension/src/options/`: local consent, configuration, and debug controls
- `extension/src/config/`: readable default domain policy
- `extension/src/shared/`: state, filtering, identifiers, schema, and storage
- `extension/scripts/`: dependency-free policy checks

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
   - Stores validated events before any future upload.
   - Retention, encryption, and deletion behavior are `TODO` pending study and
     IRB requirements.
5. **Backend ingestion**
   - Deferred until after the extension MVP and an explicit security review.
6. **Research ETL**
   - Deferred; will operate on approved, versioned event contracts.

## Event Flow

`browser/DOM signal -> consent gate -> scoped parser/filter -> minimization -> local queue`

Future upload must be separately consented, authenticated, and documented.

## Boundaries

- No private-domain capture.
- No password, form-field, cookie, or token capture.
- No optional text capture without a later explicit decision.
- Synthetic/demo data only in this repository.
