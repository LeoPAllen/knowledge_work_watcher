# Project History

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
