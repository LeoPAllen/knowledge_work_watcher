# AGENTS.md

## Purpose

Knowledge Work Watcher is an ambient, privacy-preserving research browser
extension for reconstructing knowledge-work episodes. The Chrome Manifest V3
client has local navigation, search, LLM, and knowledge-site telemetry. Backend
ingestion accepts validated events into local SQLite; extension sync is
consent-gated. Local ETL produces sessionized synthetic CSV exports.

## File Map

- `README.md`: project overview and status
- `PROJECT_HISTORY.md`: brief decisions and next steps, newest first
- `docs/architecture.md`: planned system boundaries
- `docs/privacy-security.md`: privacy and threat controls
- `docs/data-inventory.md`: permitted and excluded data
- `docs/event-schema.md`: proposed event contract
- `docs/implementation-plan.md`: staged work
- `docs/research-background.md`: brief source notes
- `docs/adr/`: architectural decisions
- `backend/`: authenticated ingestion API, SQLite storage, and tests
- `research-etl/`: synthetic fixtures, sessionization, CSV exports, and tests

## Coding Rules

- Prefer small, reviewable changes that follow documented stages.
- Do not add dependencies without a concrete need and justification.
- Keep Chrome Manifest V3 permissions narrow and domain-specific.
- Treat event-schema changes as API changes; document and test them.
- Keep ingestion append-only and avoid logging event bodies or auth tokens.
- Keep upload off by default and preserve events until server acknowledgement.
- Keep ETL deterministic and fail closed on schema or privacy quality checks.
- Add focused tests for parsers, redaction, and privacy filters.
- Use synthetic fixtures only.

## Privacy Rules

- Capture only after consent and while visible capture state is active.
- Use an allowlist-first domain policy; private domains are excluded.
- Never capture passwords, form fields, authentication tokens, or cookies.
- Avoid broad DOM, page-text, screenshot, or clipboard capture.
- Optional text capture requires a later explicit decision and approval.
- Never commit real participant data or identifying research exports.
- Mark all IRB-dependent statements `TODO`; do not infer approval.

## PR Rules

- Keep scope explicit and update affected docs.
- Explain permission, schema, collection, retention, or upload changes.
- Identify added dependencies and why existing APIs are insufficient.
- Include verification performed and remaining limitations.

## Verification Rules

- Run formatting, lint, type, and test checks that exist for the changed area.
- Test parsers and privacy filters with synthetic positive and negative cases.
- Inspect manifest host permissions and event payload examples manually.
- Run `git diff --check` and confirm no participant data is staged.

## Review Guidelines

Codex reviewers must flag:

- PII logging or identifying payload fields;
- overbroad host permissions;
- capture of form fields or passwords;
- private-domain capture;
- broad DOM or page capture;
- dependency additions without justification;
- silent changes to the event schema; and
- missing tests for parsers or privacy filters.
