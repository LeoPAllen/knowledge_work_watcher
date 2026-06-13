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

## Prohibited Capture

- Passwords, form fields, cookies, authentication tokens, or clipboard data
- Private, intranet, localhost, file, or unapproved domains
- Broad DOM snapshots, page text, screenshots, or browsing history imports
- Real participant data in source control, fixtures, logs, or examples

Optional text capture is prohibited for the MVP unless a later reviewed change
explicitly permits it for named fields and domains.

## Security Expectations

- Request the narrowest Chrome permissions and host patterns possible.
- Validate event shape and domain eligibility at collection and persistence.
- Prevent sensitive values from entering logs or error reports.
- Use synthetic/demo data for development and tests.
- Review changes to permissions, collection, retention, and transport manually.

## Local Storage and Export

- The queue uses `chrome.storage.local`; it is local but not application-level
  encrypted and must still be treated as sensitive.
- The only current automatic event is extension installation metadata.
- Debug events are explicitly synthetic and contain no participant identifier.
- JSON export creates a user-managed local file outside extension storage.
- Raw participant IDs must not enter events, logs, or exports.
- Participant IDs are hashed in the options page before storage or messaging.
- Study server URL and allowlist settings remain local and are not operational.

## Consent Status

- Current consent copy is a development placeholder.
- `TODO(IRB)`: replace it with approved consent language before study use.
- The interface does not claim IRB approval.
- An active control state does not currently cause browsing capture.

## Deferred Decisions

- `TODO(IRB)`: participant consent language and withdrawal procedure.
- `TODO(IRB)`: approved retention and deletion periods.
- `TODO(IRB)`: whether any text-bearing fields may be collected.
- `TODO(Security)`: local encryption and key-management design.
- `TODO(Security)`: backend authentication, transport, and access controls.
