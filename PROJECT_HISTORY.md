# Project History

## 2026-06-14 - MVP end-to-end verification

- Added a synthetic loopback E2E path through queue, upload, API, and SQLite.
- Runs ETL over ingested events and reports event/table row counts and paths.
- Verifies minimized denied/private skip storage and zero rejected events.
- Packages the extension and records ignored local verification artifacts.
- Added the E2E command to CI without dependencies or capture-scope changes.
- Checks: full tests, policy, E2E, package, audit, and diff inspection.
- Next: manually validate unpacked Chrome controls and live site selectors.

## 2026-06-14 - CI, packaging, and developer workflow

- Added PR/main CI for extension, backend, ETL, workflow, and policy checks.
- Added a review-only extension ZIP command and archive-content validation.
- Added tracked real-data path and high-confidence secret checks.
- Updated package scripts, README commands, PR checks, and local env guidance.
- Checks: tests, manifest/policy, package inspection, audit, and diff check.
- No dependencies, permissions, telemetry, or release automation were added.
- Next: validate the packaged extension manually in Chrome before a study build.

## 2026-06-14 - Privacy and security hardening

- Restricted parser messages to scoped tab senders and UI actions to extension pages.
- Blocked sensitive LLM paths through the shared privacy filter.
- Prevented inactive content scripts from attaching DOM observers or listeners.
- Enforced text redaction invariants in the shared schema and backend ingestion.
- Required persisted debug mode before synthetic event creation.
- Neutralized spreadsheet formulas in research CSV exports.
- Added focused extension, backend, and ETL regression tests.
- Next: complete the deferred deployment security review.

## 2026-06-13 - Research ETL exports

- Added dependency-free JSONL and SQLite input for schema version 1 events.
- Added deterministic activity sessionization with a 30-minute default gap.
- Produces clean events, page views, search/LLM episodes, exposures, links,
  and solution-assembly traces as CSV.
- Added duplicate, timestamp, schema, private-leak, and secret-output checks.
- Added a reviewed synthetic fixture and deterministic transformation tests.
- Generated research exports remain ignored; real participant data is banned.
- Next: validate episode definitions with the research analysis plan.

## 2026-06-13 - Extension upload sync

- Added opt-in, consented, active-capture batch upload to the MVP backend.
- Requires HTTPS or loopback development URLs and exact runtime host grants.
- Stores the bearer study token locally but never redisplays or logs it.
- Removes only acknowledged/duplicate events from the local queue.
- Preserves request failures with persisted bounded exponential backoff.
- Moves explicit rejections to a metadata-only local dead-letter queue.
- Added popup/options status, manual sync, export, and clear controls.
- Next: replace shared-token auth before any participant deployment.

## 2026-06-13 - MVP backend ingestion API

- Added Fastify single/batch ingestion, health, and schema-version endpoints.
- Reuses strict schema version 1 validation before persistence.
- Requires an environment-provided bearer study token placeholder.
- Stores accepted event JSON append-only in local SQLite.
- Adds receive timestamps and request IDs without logging raw payloads.
- Enforces body/batch limits and reports safe partial batch rejection.
- Added synthetic API, auth, storage, CORS, size, and logging tests.
- Next: security review before implementing extension upload.

## 2026-06-13 - Knowledge-site exposure parsers

- Added scoped Q&A, GitHub, docs, package, and Wikipedia parsers.
- Captures titles/headings and structured IDs, tags, scores, and page types.
- Q&A bodies, code, README/article text, comments, and raw DOM are excluded.
- GitHub events require a valid repository URL and explicit public marker.
- Private, ambiguous, profile, settings, and unknown routes skip silently.
- Added exact host scopes and synthetic fixtures across knowledge categories.
- Next: validate live selectors before expanding supported page types.

## 2026-06-13 - LLM interaction parsers

- Added scoped parsers for ChatGPT, Claude, Gemini, Perplexity, and Copilot.
- Captures redacted prompts, turn metadata, model labels, and source links.
- Response text, inputs, uploads, attachments, profiles, and raw DOM are absent.
- Sources store filtered destination hostname/hash only.
- Added session-local conversation IDs and duplicate snapshot suppression.
- Added exact host permissions and synthetic fixtures for all five tools.
- Next: validate selectors manually before expanding LLM metadata.

## 2026-06-13 - Search exposure parsers

- Added scoped parsers for Google, Bing, and DuckDuckGo result pages.
- Captures redacted queries and recognized organic result rank/title metadata.
- Stores destination hostname/hash only; no snippets, full URLs, or raw DOM.
- Added inferred clicks and parser errors with allowlisted safe metadata.
- Added exact host permissions and no broad scripting or tab permission.
- Added synthetic fixtures and parser/privacy tests using dev-only linkedom.
- Next: validate selectors manually before considering additional search hosts.

## 2026-06-13 - Ambient navigation telemetry

- Added consent-gated top-frame navigation, tab, and window event handling.
- Added only the `webNavigation` permission; no host access or content scripts.
- Stores allowed hostname, path-derived URL hash, and session-local browser IDs.
- Excludes raw URLs, queries, fragments, titles, page text, and form data.
- Stores denied/private/unknown navigation only as minimized skip metadata.
- Added schema, gating, leak-prevention, identifier, and manifest tests.
- Next: manually validate unpacked behavior before any search/LLM adapters.

## 2026-06-13 - Domain privacy filter

- Added readable default allowlist and sensitive-domain denylist categories.
- Added fail-closed URL classification with deny rules taking precedence.
- Blocks private networks, local files, browser pages, and login/account paths.
- Supports explicit debug-only local/private network classification.
- Added tests for all outcomes, lookalikes, custom domains, and precedence.
- Added no host permissions, browsing listeners, telemetry, or URL persistence.
- Next: require the classifier in each future site adapter before collection.

## 2026-06-13 - Consent and ambient controls

- Added persistent participant, server, allowlist, consent, and debug settings.
- Hashes participant IDs before storage and never redisplays the raw value.
- Requires explicit placeholder consent before ambient state can be enabled.
- Added visible active, paused, and off states in popup and options controls.
- Queues consent, pause, resume, and configuration metadata locally.
- Consent revocation stops ambient state before attempting event logging.
- Added tests for defaults, gating, transitions, persistence, and hashing.
- Next: enforce allowlists before adding any browsing event adapters.

## 2026-06-13 - Typed events and local queue

- Added schema version 1 for extension-state and synthetic test events.
- Added runtime validation and a 500-event local queue in extension storage.
- Added options controls to create, count, export, and clear queued events.
- Added Node tests for validation, queue operations, limits, and concurrency.
- Added only the Chrome `storage` permission; no host access or browsing capture.
- Kept participant hashes and session IDs nullable; raw IDs are not queued.
- Next: implement reviewed consent and capture-state transitions.

## 2026-06-13 - Minimal MV3 shell

- Added a dependency-free Chrome Manifest V3 extension shell.
- Added an inert service worker plus static popup and options pages.
- Requested no extension or host permissions and added no content scripts.
- Kept consent, capture, configuration, storage, and network behavior inactive.
- Added a manifest policy check and unpacked-loading instructions.
- Next: define consent and capture-state behavior before adding persistence.

## 2026-06-13 - Repository scaffold

- Established documentation for the ambient Chrome Manifest V3 research tool.
- Recorded consent, visible pause/resume, allowlist, and local-queue decisions.
- Defined a conceptual MVP event inventory without implementing telemetry.
- Prohibited committed participant data; development uses synthetic/demo data.
- Deferred backend ingestion, research ETL, and optional text capture.
- Next: scaffold the extension shell and privacy controls without telemetry.
