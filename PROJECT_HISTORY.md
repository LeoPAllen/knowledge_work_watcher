# Project History

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
