# Data Inventory

This inventory covers implemented extension and ingestion data. Development
records must be synthetic or demo data.

## Implemented Local Data

| Category | Stored value | Use |
| --- | --- | --- |
| Participant | SHA-256 hash or null | Future pseudonymous event linkage |
| Study server | HTTPS/loopback origin | Batch ingestion endpoint |
| Study token | Write-only local string | MVP bearer authentication |
| Upload state | Enabled/status/retry timestamps | User control and diagnostics |
| Consent | Accepted/not accepted | Gates ambient control state |
| Capture | Enabled, paused, session ID | Visible local control state |
| Allowlist | Domain strings | Custom privacy-filter inputs; no adapters yet |
| Debug | Local-only flag | Gates synthetic test event creation |
| Domain policy | Static allow/deny configuration | Gates every navigation URL |
| Navigation | Hostname and URL hash | Allowed top-frame pages only |
| Browser context | Session-local tab/window IDs | Relates allowed local events |
| Transition | Type, qualifiers, timestamps, status | Reconstructs navigation flow |
| Skips | Signal and policy reason/category | No URL, hostname, title, or IDs |
| Search query | Redacted query or null, engine | Supported search pages only |
| Search exposure | Rank, title, destination hostname/hash, type | Up to 20 recognized organic results |
| Search click | Rank and destination hostname/hash | Recognized result anchors only |
| Parser error | Kind/site, code, version, page hash | No exception or DOM text |
| LLM prompt | Redacted prompt or null, turn, tool/model | Named prompt nodes only |
| LLM response | Turn and source count | Response text always excluded |
| LLM sources | Destination hostname/hash | Assistant links, max 20 |
| LLM interaction | Counts, parser version, conversation ID | Metadata only |
| Knowledge page | Site/category, type, title, URL hash | Allowlisted pages only |
| Q&A | IDs, tags, scores, accepted marker | No question/answer text |
| Public repository | Owner/repo, path, issue/PR number | Explicit public marker required |
| Docs/reference | Title and up to 20 headings | No article/README body |
| Queue | Validated control/telemetry events | Local export and clearing |
| Rejections | Event ID/type, reason, timestamp | Metadata-only dead letters |
| Raw ingestion | Validated event JSON | Append-only local SQLite |
| Server metadata | Receive time and request ID | Operations and tracing |

Raw participant IDs are hashed before storage and are not redisplayed.

## Deferred Telemetry

| Category | Future intent | Minimization |
| --- | --- | --- |
| Downstream use | Navigation after search/LLM exposure | Link through local event IDs |
| Control | Consent and pause/resume transitions | No unnecessary user attributes |

## Excluded

- Passwords, form fields, cookies, tokens, clipboard contents, and screenshots
- Broad DOM or page-text capture
- Private, intranet, localhost, file, and non-allowlisted domains
- Real participant records in the repository
- Upload while disabled, paused, not consented, or permission is absent
- Raw URLs, query strings, fragments, credentials, and navigation titles
- Search snippets, ads, arbitrary page text, and raw DOM
- LLM response text, profile fields, uploads, attachments, and prompt inputs
- Q&A bodies, code, README/article text, comments, and raw page content
- Private/ambiguous GitHub repositories, profiles, settings, and dashboards

## Deferred

- Production upload receipts and operational logs
- Research ETL outputs and episode-level derived tables
- `TODO(IRB)`: retention, deletion, participant identifiers, and approved text
  fields
- `TODO(IRB)`: approve search query and result-title fields before study use
- `TODO(IRB)`: approve LLM prompt text before study use
- `TODO(IRB)`: approve knowledge-page titles/headings before study use
