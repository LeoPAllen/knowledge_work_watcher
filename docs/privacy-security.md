# Privacy and Security

## Defaults

- Capture is off until consent is recorded.
- Pause/resume state is continuously visible and user-controlled.
- Domains are denied unless explicitly allowlisted.
- Events are minimized before entering a local queue.
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

## Deferred Decisions

- `TODO(IRB)`: participant consent language and withdrawal procedure.
- `TODO(IRB)`: approved retention and deletion periods.
- `TODO(IRB)`: whether any text-bearing fields may be collected.
- `TODO(Security)`: local encryption and key-management design.
- `TODO(Security)`: backend authentication, transport, and access controls.
