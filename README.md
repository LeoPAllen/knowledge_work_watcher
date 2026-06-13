# Knowledge Work Watcher

Knowledge Work Watcher is a research prototype for studying how people move
between search, generative AI, and source material during knowledge work.

The intended client is a Chrome Manifest V3 extension that runs in ambient
mode. Capture is consent-gated, visibly pausable, and restricted by an
allowlist-first domain policy.

## Status

This repository contains a Chrome Manifest V3 extension, a local MVP ingestion
API, and project documentation. The extension records minimized navigation,
search, LLM, and knowledge-site events locally after consent. The Fastify API
validates schema version 1 events and appends them to SQLite. Extension upload,
is optional, consent-gated, and active-capture-only. Local research ETL converts
synthetic JSONL or SQLite events into sessionized CSV tables. LLM response-text
capture and broad page capture remain absent. Only synthetic or demo data may
be used during development.

## MVP Direction

The MVP is intended to reconstruct knowledge-work episodes from:

- navigation and downstream navigation events;
- tab and window focus changes;
- search queries and result exposure on allowlisted search domains;
- LLM prompt/response metadata on allowlisted LLM domains; and
- source links exposed by LLMs when available.

Optional text capture is out of scope until explicitly allowed by a later
decision. Real participant data must never be committed.

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

See [extension/README.md](extension/README.md) for unpacked-loading and test
instructions and [backend/README.md](backend/README.md) for API setup. Run
`npm test` for all tests and `npm run backend:start` for the configured API.
Run `npm run etl:synthetic` for reviewed synthetic research exports; see
[research-etl/README.md](research-etl/README.md) for input and session rules.
See [AGENTS.md](AGENTS.md) for repository rules.
