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
| Search snippet | Redacted/capped visible snippet plus parser metadata | Study-expanded event |
| Search full URL | Normalized allowlisted destination plus hostname/hash | Tracking/secret parameters removed |
| Search click | Rank and destination hostname/hash | Recognized result anchors only |
| Parser error | Kind/site, code, version, page hash | No exception or DOM text |
| LLM prompt | Redacted prompt or null, turn, tool/model | Named prompt nodes only |
| LLM response | Turn and source count | Minimized event |
| LLM response text | Redacted/capped visible assistant text | Study-expanded event |
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
| Clean events | Minimized envelope, hashes, categories | Quality-reviewed base table |
| Episodes | Search/LLM groups and activity sessions | Reconstruct work sequences |
| Exposures | Page, knowledge, and source metadata | Analyze information exposure |
| Derived links | Hash-matched downstream visits and traces | Analyze solution assembly |
| Sensitive exports | Response text, snippets, full URLs | Three separate CSV tables |

Raw participant IDs are hashed before storage and are not redisplayed.

## Deferred Telemetry

| Category | Future intent | Minimization |
| --- | --- | --- |
| Downstream use | Navigation after search/LLM exposure | Link through local event IDs |
| Control | Consent and pause/resume transitions | No unnecessary user attributes |

## Excluded

- Passwords, form fields, cookies, tokens, clipboard contents, and screenshots
- Broad DOM or arbitrary page-text capture
- Private, intranet, localhost, file, and non-allowlisted domains
- Real participant records in the repository
- Upload while disabled, paused, not consented, or permission is absent
- Raw navigation URLs, credentials, fragments, and navigation titles
- Search ads, unrelated page text, profile fields, and raw DOM
- LLM profile fields, uploads, attachments, file contents, and hidden fields
- Q&A bodies, code, README/article text, comments, and raw page content
- Private/ambiguous GitHub repositories, profiles, settings, and dashboards

## Deferred

- Production upload receipts and operational logs
- `TODO(IRB)`: retention, deletion, participant identifiers, and approved text
  fields
- `TODO(IRB)`: supply externally approved language and field authorization
- `TODO(IRB)`: approve knowledge-page titles/headings before study use
