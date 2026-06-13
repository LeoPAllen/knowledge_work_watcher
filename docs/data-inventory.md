# Data Inventory

This inventory describes proposed MVP categories, not implemented collection.
All development records must be synthetic or demo data.

| Category | MVP intent | Minimization |
| --- | --- | --- |
| Navigation | Allowlisted URL transitions | Prefer origin/path; exclude secrets and sensitive query parameters |
| Focus | Tab/window focus and duration signals | Stable local IDs; no titles unless later approved |
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

## Deferred

- Backend identifiers, upload receipts, and server logs
- Research ETL outputs and episode-level derived tables
- `TODO(IRB)`: retention, deletion, participant identifiers, and approved text
  fields
