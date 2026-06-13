# Privacy and Security

## Defaults
- Capture is off until consent is recorded.
- Pause/resume state is continuously visible and user-controlled.
- Ambient state cannot be enabled before explicit placeholder consent.
- Revoking consent locally disables ambient state and clears its session.
- Domains are denied unless explicitly allowlisted.
- Events are minimized before entering a local queue.
- The local queue is bounded at 500 validated events.
- Backend upload is not implemented.
- Navigation capture requires active consent, ambient mode, and an allowed URL.

## Prohibited Capture
- Passwords, form fields, cookies, authentication tokens, or clipboard data
- Private, intranet, localhost, file, or unapproved domains
- Broad DOM snapshots, page text, screenshots, or browsing history imports
- Real participant data in source control, fixtures, logs, or examples

Only search query/title and named LLM prompt text are permitted on reviewed
domains. LLM response text and all other page text remain prohibited.

## Security Expectations
- Request the narrowest Chrome permissions and host patterns possible.
- Validate event shape and domain eligibility at collection and persistence.
- Prevent sensitive values from entering logs or error reports.
- Review changes to permissions, collection, retention, and transport manually.

## Local Storage and Export
- The queue uses `chrome.storage.local`; it is local but not application-level
  encrypted and must still be treated as sensitive.
- Debug events are explicitly synthetic and contain no participant identifier.
- JSON export creates a user-managed local file outside extension storage.
- Raw participant IDs must not enter events, logs, or exports.
- Participant IDs are hashed in the options page before storage or messaging.

## URL Policy
- Every observed navigation URL must pass the shared privacy filter.
- Denylisted and sensitive rules override default and custom allowlists.
- Invalid, unknown, and unsupported URLs fail closed.
- Local/browser pages, login/account surfaces, private networks, webmail,
  private documents, finance, health, and adult domains are blocked.
- Local/private network URLs require both debug mode and an explicit debug
  override; sensitive paths remain blocked.
- Custom allowlist domains require review because static sensitive-domain
  lists cannot identify every sensitive service.
- Allowed records store hostname and a SHA-256 of scheme/host/path only.
- Denied, private, invalid, and unknown records omit all page identity.
- Navigation titles are never requested or stored.
- Search parsing is limited to named result selectors on Google, Bing, and
  DuckDuckGo; it never reads input fields, snippets, profiles, or raw DOM.
- Queries containing email, phone, or obvious secret patterns are stored as
  null with a redaction category.
- Search destinations are reduced to hostname and URL hash after filtering.
- LLM scripts are limited to ChatGPT, Claude, Gemini, Perplexity, and Copilot.
- Prompt parsing uses named text descendants, not inputs or whole containers.
- Prompts and model labels use email, phone, and secret redaction.
- Assistant containers expose link URLs only; response text is never read.
- Upload, attachment, download, profile, and account elements are excluded.
- LLM sources store only filtered destination hostname/hash.
- Knowledge parsers store URL-derived IDs and selected titles/headings only;
  Q&A bodies, code, README/article text, and comments are never read.
- GitHub requires a valid repository route and public marker; private,
  ambiguous, profile, settings, and unsupported routes skip.
- Deny/private URL rules run again in the background before queueing.

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
- `TODO(Security)`: DNS rebinding/resolution safeguards before any host access.
