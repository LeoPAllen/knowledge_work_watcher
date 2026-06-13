## Scope

- [ ] The change is narrowly scoped and excludes unrelated work.
- [ ] No backend, telemetry, or dependency work was added unless in scope.

## Privacy and Data Minimization

- [ ] Capture remains consent-gated with visible pause/resume behavior.
- [ ] Payloads are minimized and use synthetic/demo data only.
- [ ] No PII, credentials, form fields, private domains, or broad page capture.

## Permissions

- [ ] Chrome permissions and host patterns are unchanged or justified below.
- [ ] Domain access remains explicit and allowlist-first.

## Tests and Checks

- [ ] Relevant automated checks pass.
- [ ] Parsers/privacy filters have positive and negative tests when changed.
- [ ] `git diff --check` passes.

## Documentation

- [ ] Event-schema changes are explicit and versioning impact is addressed.
- [ ] Architecture, privacy, history, or implementation docs are updated.
- [ ] IRB-dependent claims are marked `TODO`.

## Manual Review

- [ ] I reviewed the diff for sensitive data and overbroad collection.
- [ ] I manually reviewed permission, schema, retention, and upload impacts.

## Summary

<!-- What changed and why? -->

## Verification

<!-- Commands and manual checks run. -->
