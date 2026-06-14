# Knowledge Work Watcher

Knowledge Work Watcher is a research prototype for studying how people move
between search, generative AI, and source material during knowledge work.

The intended client is a Chrome Manifest V3 extension that runs in ambient
mode. Capture is consent-gated, visibly pausable, and restricted by an
allowlist-first domain policy.

## Status

This repository contains a Chrome Manifest V3 extension, a local MVP ingestion
API, and project documentation. The extension records minimized navigation,
search, LLM, and knowledge-site events locally after consent. The study build
also records visible LLM responses, search snippets, and normalized full result
URLs on allowlisted parser domains whenever baseline capture is active. The
Fastify API validates schema versions 1 and 2 and appends events to SQLite. Upload
is optional, consent-gated, and active-capture-only. Local research ETL converts
synthetic JSONL or SQLite events into minimized and separate sensitive CSV
tables. Raw DOM and broad page capture remain absent. Only synthetic or demo
data may be used during development.

## MVP Direction

The MVP is intended to reconstruct knowledge-work episodes from:

- navigation and downstream navigation events;
- tab and window focus changes;
- search queries and result exposure on allowlisted search domains;
- LLM prompt/response metadata on allowlisted LLM domains; and
- source links exposed by LLMs when available.
- study-expanded LLM response text, search snippets, and full result URLs.

Study-expanded fields are always enabled with baseline active capture; there
are no per-field toggles. Participants should install only after the external
study consent flow. Real participant data must never be committed.

## Principles

- Collect only after consent and while capture is visibly active.
- Start from an explicit domain allowlist.
- Queue locally and remove only server-acknowledged events.
- Minimize content and permissions by default.
- Mark IRB-dependent requirements as `TODO` until approved.

## Documentation

- [Architecture](docs/architecture.md)
- [Privacy and security](docs/privacy-security.md)
- [Data inventory](docs/data-inventory.md)
- [Event schema](docs/event-schema.md)
- [Implementation plan](docs/implementation-plan.md)
- [Research background](docs/research-background.md)
- [MVP scope decision](docs/adr/0001-mvp-scope.md)

## Development

Requires Node.js 24 and the standard `zip`/`unzip` commands.

```sh
npm ci                    # install locked dependencies
npm test                  # extension, backend, ETL, and workflow tests
npm run check             # manifest, permissions, secrets, and data paths
npm run verify:e2e        # queue, upload, SQLite, ETL, and package verification
npm run backend:start     # run the configured local ingestion API
npm run etl:synthetic     # generate synthetic inputs and CSV exports
npm run package:extension # create dist/knowledge-work-watcher-0.1.0.zip
```

The E2E command uses only reviewed synthetic events and loopback networking. It
writes ignored verification artifacts under `backend/data/`,
`research-exports/e2e/`, and `dist/`.

For the backend, copy `.env.example` to ignored `.env`, load its variables, and
use a synthetic token. Load `extension/` unpacked from `chrome://extensions`.
To test local upload, enable local debug mode, create a synthetic event, set the
loopback server URL/token, grant its runtime permission, and select **Sync now**.

```sh
cp .env.example .env
set -a; source .env; set +a
npm run backend:start
```

See [extension/README.md](extension/README.md) for unpacked/manual checks,
[backend/README.md](backend/README.md) for API setup, and
[research-etl/README.md](research-etl/README.md) for ETL rules. CI runs on pull
requests and `main`; review ZIPs are CI artifacts only and are not published.
