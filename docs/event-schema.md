# Event Schema

This is a proposed contract for future implementation. No events are currently
collected.

## Common Envelope

| Field | Purpose |
| --- | --- |
| `schema_version` | Explicit contract version |
| `event_id` | Random local event identifier |
| `event_type` | One of the types below |
| `occurred_at` | Client timestamp |
| `session_id` | Local capture-session identifier |
| `source` | Adapter or browser subsystem |
| `domain` | Normalized, allowlisted domain |
| `payload` | Event-specific minimized fields |

Do not include participant identity, cookies, tokens, passwords, or arbitrary
DOM/page content. URL handling must remove credentials, fragments, and
unapproved query parameters.

## Proposed Event Types

- `capture_state_changed`: consent, pause, or resume transition
- `navigation`: allowlisted URL transition and referrer relationship
- `tab_focus_changed`: active tab changed
- `window_focus_changed`: browser window focus changed
- `search_submitted`: allowlisted search query metadata
- `search_results_exposed`: minimal result rank and normalized link metadata
- `llm_interaction`: prompt/response timing and structural metadata
- `llm_sources_exposed`: normalized source links shown by an LLM
- `downstream_navigation`: navigation linked to prior search/LLM exposure

## Versioning

- Schema changes require documentation, migration consideration, and tests.
- New fields default to optional until all producers and consumers agree.
- Text-bearing fields require an explicit privacy decision and
  `TODO(IRB)` resolution before implementation.
