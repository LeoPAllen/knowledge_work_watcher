# Event Schema

Schema version 1 supports extension-state metadata and synthetic queue testing.
It does not support URL, page, tab, search, LLM, or other browsing telemetry.

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
| `source` | `service_worker`, `options`, or `debug` |
| `payload` | Strict event-specific object |

Raw participant IDs, URLs, cookies, tokens, passwords, and arbitrary DOM/page
content are not valid schema fields.

## Version 1 Event Types

- `extension_installed`: installation lifecycle reason
- `consent_changed`: boolean consent state
- `capture_paused`: empty payload
- `capture_resumed`: empty payload
- `config_changed`: names of changed configuration fields, not values
- `queue_test_event`: marker requiring `synthetic: true`

Only `extension_installed` and user-created `queue_test_event` records are
currently produced. Consent, capture, and configuration behavior remains
unimplemented.

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
