# Event Schema

Schema version 1 supports local control events and minimized ambient navigation
telemetry. It does not support page text, search queries, or LLM content.

## Common Envelope

| Field | Purpose |
| --- | --- |
| `event_id` | Random local event identifier |
| `schema_version` | Contract version; currently `1` |
| `event_type` | Supported event name |
| `created_at` | ISO 8601 UTC client timestamp |
| `participant_id_hash` | Nullable future pseudonymous identifier |
| `session_id` | Nullable future local session identifier |
| `extension_version` | Producing extension version |
| `capture_mode` | `off`, `paused`, or `ambient` |
| `source` | Extension component, including `telemetry` |
| `payload` | Strict event-specific object |

Raw participant IDs, URLs, titles, cookies, tokens, passwords, query strings,
and arbitrary DOM/page content are not valid schema fields.

## Version 1 Event Types

- `extension_installed`: installation lifecycle reason
- `consent_changed`: boolean consent state
- `capture_paused`: empty payload
- `capture_resumed`: empty payload
- `config_changed`: names of changed configuration fields, not values
- `queue_test_event`: marker requiring `synthetic: true`
- `tab_created`, `tab_activated`: minimized context for an allowed page
- `tab_updated`: allowed context plus `loading` or `complete`
- `navigation_committed`: allowed context plus transition metadata
- `window_focus_changed`: allowed context plus focused state
- `capture_skipped`: signal and policy reason only; no page identity

Currently produced events are:

- `extension_installed` on extension installation or update
- `consent_changed` on local acceptance or revocation
- `capture_paused` and `capture_resumed` on explicit user actions
- `config_changed` with changed field names only, never values
- `queue_test_event` when local-only debug mode is enabled

Allowed page context contains only SHA-256 URL hash, hostname, session-local
tab/window pseudonyms, and browser timestamp. The hash input is scheme, host,
port, and path; query and fragment are excluded. Navigation may also contain
Chrome transition type and qualifiers.

## Local Queue

- Events are validated before append.
- The queue uses `chrome.storage.local` and rejects appends after 500 events.
- Events can be counted, exported as JSON, or cleared from the options page.
- No network upload exists.

## Versioning

- Schema changes require documentation, migration consideration, and tests.
- Unknown envelope or payload fields are rejected.
- Text-bearing fields require an explicit privacy decision and
  `TODO(IRB)` resolution before implementation.
