# Event Schema

Schema versions 1 and 2 support local controls and scoped telemetry. Version 2
adds explicit study-expanded events; raw DOM is never valid.

## Common Envelope
| Field | Purpose |
| --- | --- |
| `event_id` | Random local event identifier |
| `schema_version` | Contract version; supported `1` and `2` |
| `event_type` | Supported event name |
| `created_at` | ISO 8601 UTC client timestamp |
| `participant_id_hash` | Nullable future pseudonymous identifier |
| `session_id` | Nullable future local session identifier |
| `extension_version` | Producing extension version |
| `capture_mode` | `off`, `paused`, or `ambient` |
| `source` | Extension component, including `telemetry` |
| `payload` | Strict event-specific object |

Raw participant IDs, cookies, credentials, hidden fields, and arbitrary
DOM/page content are not valid schema fields.

## Event Types
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
- `search_snippet_observed`: redacted/capped visible result snippet
- `search_result_full_url_observed`: normalized allowlisted destination URL
- `llm_prompt_observed`: redacted-or-null prompt and turn metadata
- `llm_response_observed`: response index/source count; no response text
- `llm_response_text_observed`: redacted/capped visible assistant response
- `llm_source_links_exposed`: minimized source hostname/hash records
- `llm_interaction_metadata`: turn/source counts, tool, model, parser version
- `knowledge_page_exposed`: category, page type, title, and URL hash
- `qna_question_exposed`, `qna_answer_exposed`: IDs and status metadata
- `code_repo_exposed`: validated public repository URL metadata
- `docs_page_exposed`: page/package title and up to 20 section headings
- `parser_error`: allowlisted error code and parser metadata only
- `parser_degraded`: safe parser health counts and confidence only

Allowed page context contains only SHA-256 URL hash, hostname, session-local
tab/window pseudonyms, and browser timestamp. The hash input is scheme, host,
port, and path; query and fragment are excluded. Navigation may also contain
Chrome transition type and qualifiers.

Expanded events require schema version 2 and
`capture_profile: "study_expanded"`. They include parser name/version,
source domain, capture method, selector family, confidence, and capping or
redaction metadata. Existing minimized events remain unchanged.

LLM records include tool, optional model, page hash, session-local conversation
ID, and browser context. Prompts are redacted and capped at 500 characters.
Sources contain hostname/hash only. Response text is capped at 8,000 characters;
snippets at 1,000; full URLs at 2,048. Full URLs strip fragments, common
tracking fields, and credential-like parameters and require an allowed
destination classification.

## Local Queue
- Events are validated before append.
- The queue uses `chrome.storage.local` and rejects appends after 500 events.
- Accepted/duplicate events leave the queue only after server acknowledgement.
- Rejections retain event ID/type and safe reason, never the event payload.

## Backend Ingestion
- Single and batch endpoints accept schema versions 1 and 2.
- The backend reuses the canonical validator and rejects unknown fields.
- Accepted rows add server receive time and request ID without changing events.
- SQLite stores the raw validated event JSON append-only.
- Batch responses are validated before local queue settlement.
