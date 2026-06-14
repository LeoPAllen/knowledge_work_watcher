# Privacy and Security

## Defaults
- Capture is off until consent is recorded.
- Pause/resume state is continuously visible and user-controlled.
- Ambient state cannot be enabled before explicit placeholder consent.
- Revoking consent locally disables ambient state and clears its session.
- Events are minimized before entering a local queue.
- The local queue is bounded at 500 validated events.
- Upload is off by default and requires active consent/capture.
- Navigation and parser capture require active consent and an allowed URL.

## Prohibited Capture
- Passwords, form fields, cookies, authentication tokens, or clipboard data
- Private, intranet, localhost, file, or unapproved domains
- Real participant data in source control, fixtures, logs, or examples

Only reviewed search/title and LLM prompt text is permitted; all other page text remains prohibited.

## Security Expectations
- Request the narrowest Chrome permissions and host patterns possible.
- Validate sender, event shape, redaction, and domain at each trust boundary;
  inactive or disallowed parser pages attach no DOM observers or listeners.
- Require bearer authentication and bounded request bodies for ingestion.
- Keep tokens in environment variables and event bodies out of default logs.
- Extension tokens are write-only in UI and stored locally without encryption.

## Local Storage and Export
- The queue uses `chrome.storage.local`; it is local but not application-level
  encrypted and must still be treated as sensitive.
- Raw participant IDs must not enter events, logs, or exports.
- Participant IDs are hashed in the options page before storage or messaging.
- Accepted backend events are append-only in local, unencrypted SQLite.
- Server rows add receive time and request ID; no event query API exists.
- CSV exports neutralize formulas; rejection records never contain payloads.

## URL Policy
- Every observed navigation URL must pass the shared privacy filter.
- Denylisted and sensitive rules override default and custom allowlists.
- Local/browser pages, login/account surfaces, private networks, webmail,
  private documents, finance, health, and adult domains are blocked.
- Local/private network URLs require both debug mode and an explicit debug
  override; sensitive paths remain blocked.
- Allowed records store hostname and a SHA-256 of scheme/host/path only.
- Denied, private, invalid, and unknown records omit all page identity.
- Search parsing is limited to named result selectors on Google, Bing, and
  DuckDuckGo; it never reads input fields, snippets, profiles, or raw DOM.
- Queries containing email, phone, or obvious secret patterns are stored as
  null with a redaction category.
- LLM scripts are limited to ChatGPT, Claude, Gemini, Perplexity, and Copilot.
- Prompts and model labels use email, phone, and secret redaction.
- Assistant containers expose link URLs only; response text is never read.
- Upload, attachment, download, profile, and account elements are excluded.
- Knowledge parsers store URL-derived IDs and selected titles/headings only;
  Q&A bodies, code, README/article text, and comments are never read.
- GitHub requires a valid repository route and public marker; private,
  ambiguous, profile, settings, and unsupported routes skip.

## Upload Policy
- HTTPS is required except for explicit localhost/127.0.0.1 development.
- Optional HTTPS access is declared broadly but granted per configured host.
- Upload stops while paused, disabled, or not consented.
- Tokens and raw request bodies are never written to logs or status records.
- Backoff is persisted; only acknowledged events leave the local queue.

## Consent Status
- Current consent copy is a development placeholder.
- `TODO(IRB)`: replace it with approved consent language before study use.
- The interface does not claim IRB approval.

## Deferred Decisions
- `TODO(IRB)`: participant consent language and withdrawal procedure.
- `TODO(IRB)`: approved retention and deletion periods.
- `TODO(IRB)`: approve search query and result-title collection for study use.
- `TODO(IRB)`: approve LLM prompt collection for study use.
- `TODO(IRB)`: approve knowledge-page titles/headings for study use.
- `TODO(Security)`: local encryption and key-management design.
- `TODO(Security)`: backend authentication, transport, and access controls.
- `TODO(Security)`: replace the shared study token before deployment.
- `TODO(Security)`: DNS rebinding/resolution safeguards before any host access.
