# Event Schema

Schema version 1 supports local controls and minimized navigation, search, LLM,
and knowledge-site exposure. Broad page text is not supported.

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

Raw participant IDs, full URLs, response text, cookies, secrets, snippets, and
arbitrary DOM/page content are not valid schema fields.

## Version 1 Event Types
- `extension_installed`, `consent_changed`: lifecycle/consent state
- `capture_paused`, `capture_resumed`: empty control payloads
- `config_changed`: names of changed configuration fields, not values
- `queue_test_event`: marker requiring `synthetic: true`
- `tab_created`, `tab_activated`, `tab_updated`: minimized allowed page context
- `navigation_committed`, `window_focus_changed`: transition/focus metadata
- `capture_skipped`: signal and policy reason only; no page identity
- `search_query_observed`: engine, URL hash, and redacted-or-null query
- `search_results_exposed`: up to 20 minimized result records
- `search_result_clicked`: inferred rank and minimized destination
- `llm_prompt_observed`: redacted-or-null prompt and turn metadata
- `llm_response_observed`: response index/source count; no response text
- `llm_source_links_exposed`: minimized source hostname/hash records
- `llm_interaction_metadata`: turn/source counts, tool, model, parser version
- `knowledge_page_exposed`: category, page type, title, and URL hash
- `qna_question_exposed`, `qna_answer_exposed`: IDs and status metadata
- `code_repo_exposed`: validated public repository URL metadata
- `docs_page_exposed`: page/package title and up to 20 section headings
- `parser_error`: allowlisted error code and parser metadata only

Allowed page context contains only SHA-256 URL hash, hostname, session-local
tab/window pseudonyms, and browser timestamp. The hash input is scheme, host,
port, and path; query and fragment are excluded. Navigation may also contain
Chrome transition type and qualifiers.

Search result records contain rank, title, destination hostname/hash, and a
conservative result type. Ads are omitted by current parsers. Query and title
text are approved only for this prototype scope; `TODO(IRB)` before study use.

LLM records include tool, optional model, page hash, session-local conversation
ID, and browser context. Prompts are redacted and capped at 500 characters.
Responses are metadata-only. Sources contain hostname/hash only. Prompt text is
prototype-only; `TODO(IRB)` before study use.

Knowledge records include title, category, page type, referrer category, and
site-specific metadata. Q&A bodies, code, README/article text, comments, and raw
DOM are excluded. Titles/headings are prototype-only; `TODO(IRB)` before use.

## Local Queue
- Events are validated before append.
- The queue uses `chrome.storage.local` and rejects appends after 500 events.
- Accepted/duplicate events leave the queue only after server acknowledgement.
- Rejections retain event ID/type and safe reason, never the event payload.

## Backend Ingestion
- Single and batch endpoints accept only schema version 1 events.
- The backend reuses the canonical validator and rejects unknown fields.
- Accepted rows add server receive time and request ID without changing events.
- SQLite stores the raw validated event JSON append-only.
- Batch responses are validated before local queue settlement.

## Versioning

- Schema changes require documentation, migration consideration, and tests.
- Unknown envelope or payload fields are rejected.
- Text-bearing fields require an explicit privacy decision and
  `TODO(IRB)` resolution before implementation.
