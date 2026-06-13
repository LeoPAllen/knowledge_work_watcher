# Knowledge Work Watcher

Knowledge Work Watcher is a research prototype for studying how people move
between search, generative AI, and source material during knowledge work.

The intended client is a Chrome Manifest V3 extension that runs in ambient
mode. Capture is consent-gated, visibly pausable, and restricted by an
allowlist-first domain policy.

## Status

This repository contains a dependency-free Chrome Manifest V3 extension and
project documentation. It records minimized navigation and search-result
exposure locally only after consent and only for explicitly supported pages.
Search content scripts are limited to Google, Bing, and DuckDuckGo result pages.
It has no broad page capture, upload, backend, or research ETL. Only synthetic
or demo data may be used during development.

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
- Queue locally before any future upload.
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
instructions. See [AGENTS.md](AGENTS.md) for repository rules. Runtime code has
no dependencies; `linkedom` is used only for synthetic parser fixture tests.
