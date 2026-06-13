# Data Inventory

This inventory separates implemented local control data from deferred browsing
telemetry. All development records must be synthetic or demo data.

## Implemented Local Data

| Category | Stored value | Use |
| --- | --- | --- |
| Participant | SHA-256 hash or null | Future pseudonymous event linkage |
| Study server | URL string | Placeholder only; no requests are made |
| Consent | Accepted/not accepted | Gates ambient control state |
| Capture | Enabled, paused, session ID | Visible local control state |
| Allowlist | Domain strings | Custom privacy-filter inputs; no adapters yet |
| Debug | Local-only flag | Gates synthetic test event creation |
| Domain policy | Static allow/deny configuration | Gates every navigation URL |
| Navigation | Hostname and URL hash | Allowed top-frame pages only |
| Browser context | Session-local tab/window IDs | Relates allowed local events |
| Transition | Type, qualifiers, timestamps, status | Reconstructs navigation flow |
| Skips | Signal and policy reason/category | No URL, hostname, title, or IDs |
| Queue | Validated control/telemetry events | Local export and clearing |

Raw participant IDs are hashed before storage and are not redisplayed.

## Deferred Telemetry

| Category | Future intent | Minimization |
| --- | --- | --- |
| Search | Query metadata and exposed results | Allowlisted adapters; minimal result rank/link metadata |
| LLM | Prompt/response metadata | Metadata by default; text capture is not approved |
| LLM sources | Exposed source links when available | Normalize links; exclude unrelated page content |
| Downstream use | Navigation after search/LLM exposure | Link through local event IDs |
| Control | Consent and pause/resume transitions | No unnecessary user attributes |

## Excluded

- Passwords, form fields, cookies, tokens, clipboard contents, and screenshots
- Broad DOM or page-text capture
- Private, intranet, localhost, file, and non-allowlisted domains
- Real participant records in the repository
- Network transmission or backend records
- Raw URLs, query strings, fragments, credentials, and page titles

## Deferred

- Backend identifiers, upload receipts, and server logs
- Research ETL outputs and episode-level derived tables
- `TODO(IRB)`: retention, deletion, participant identifiers, and approved text
  fields
