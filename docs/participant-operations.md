# Participant Operations

Controlled pilot only. External consent must be completed before distribution.
`TODO(IRB)`: replace all participant-facing wording with approved language.

## Identifier And Token Model

- Assign a non-identifying participant ID such as `KWW-P01-0042`.
- Keep the ID-to-person mapping in a restricted system outside this repository.
- The extension hashes the normalized participant ID with SHA-256.
- Record the hash in the restricted operations mapping for withdrawal.
- Do not put names, emails, recruitment IDs, or consent details in the ID.
- The current backend uses one high-entropy token per pilot wave.
- Participant-specific token revocation is not implemented.

## Onboarding

1. Confirm external consent completion in the approved study platform.
2. Record consent handoff date/version and assigned participant ID externally.
3. Provide the reviewed extension package and its checksum.
4. Provide the HTTPS backend origin and wave token through a separate channel.
5. Load the unpacked extension and enter the participant ID, origin, and token.
6. Confirm the displayed extension ID matches the deployment record.
7. Accept the local baseline control, enable ambient capture/upload, and grant
   only the configured backend runtime permission.
8. Run one approved harmless validation action and confirm sync status.
9. Clear synthetic/setup records according to the approved procedure.

## External Consent Handoff

- [ ] Approved external consent completed before package delivery
- [ ] Consent document/version and timestamp recorded outside the extension
- [ ] Study-build sensitive fields disclosed
- [ ] Pause, revoke, uninstall, withdrawal, and support paths disclosed
- [ ] `TODO(IRB)`: approved withdrawal and retention wording supplied
- [ ] No claim of IRB approval appears in repository-generated text

## Participant Should Not

- Share the extension package, token, participant ID, or support screenshots.
- Install the build before external consent is complete.
- Enter names or contact details as the participant ID.
- Reuse a study token outside the assigned wave.
- Test with passwords, payment data, private documents, uploads, or secrets.
- Change developer-mode files or backend configuration.

## Support Checklist

- Confirm package checksum, Chrome version, extension ID, and build commit.
- Check capture, pause, upload, queue, and permission status without requesting
  raw event exports unless the approved support procedure requires them.
- Never request screenshots containing tokens, participant IDs, or page content.
- For parser issues, use the harmless cases in `live-parser-validation.md`.
- For suspected disclosure or private capture, stop capture and escalate.
- Record only safe diagnostics and next action in the restricted support log.

## Token Rotation Or Revocation

The current token is wave-wide. To revoke it, stop the backend, replace
`KWW_STUDY_TOKEN`, restart, and securely update authorized participants. This
invalidates every extension still holding the old token.

Do not describe the current token as participant-specific. If independent
revocation is required, mark the pilot no-go until authentication is changed.

## Pause, Revoke, Uninstall

- Pause immediately stops capture and upload while retaining local state.
- Local revoke disables ambient capture and upload.
- Before uninstall, follow the approved withdrawal/local-data procedure.
- In Chrome, open `chrome://extensions`, locate Knowledge Work Watcher, and
  select **Remove**. Uninstalling does not delete backend or ETL copies.
- Uploaded-data withdrawal follows `data-retention-withdrawal.md`.
