# Pilot Readiness

Controlled pilot only. This checklist records evidence; it is not certification
of production, IRB, or Chrome Web Store readiness.

## Owners

- Study go/no-go owner: `TODO(owner)`
- External consent owner: `TODO(owner)`
- Deployment/security owner: `TODO(owner)`
- Participant support owner: `TODO(owner)`
- Data custodian/withdrawal owner: `TODO(owner)`
- Incident stop decision owner: `TODO(owner)`

## Automated Validation

- [ ] `npm ci`
- [ ] `npm test`
- [ ] `npm run check`
- [ ] `npm run verify:e2e`
- [ ] `npm run package:extension`
- [ ] CI passes at the exact pilot commit
- [ ] Packaged manifest/permissions match the reviewed commit
- [ ] Repository contains no participant data, databases, exports, or secrets

## Manual Validation

- [ ] Backend direct POST returns `202` for a synthetic event
- [ ] Extension sync clears only acknowledged local events
- [ ] Search, LLM, and knowledge parsers produce expected events
- [ ] ETL reads the test SQLite database and produces expected counts
- [ ] Pause and revoke stop capture/upload immediately
- [ ] Denied/private pages produce no URL, title, or page-content leakage
- [ ] Backup and isolated restore are tested
- [ ] Withdrawal deletion is rehearsed with synthetic participant hashes
- [ ] Results are recorded using `docs/manual-validation-log.md`

## Current User-Reported Status

Reported on 2026-06-14, not independently certified by this document:

- `npm ci`, tests, checks, E2E, and packaging passed.
- Direct backend POST returned `202 accepted`.
- Chrome sync, search, LLM response text, and knowledge capture passed.
- ETL from SQLite, pause/revoke, and denied/private behavior passed.
- Queue export was empty after successful sync, as acknowledged events are
  removed from the local queue.

## Blockers Before Real Participants

- [ ] `TODO(IRB)`: approved external consent and participant-facing language
- [ ] `TODO(IRB)`: retention period and withdrawal/deletion promise
- [ ] External participant-ID-to-hash mapping procedure approved
- [ ] Shared wave-token risk accepted, or per-participant auth implemented
- [ ] HTTPS host, TLS operations, access control, monitoring, and incident plan
- [ ] Backup location, encryption, restore test, and deletion scope approved
- [ ] Live parser validation completed at the pilot commit
- [ ] Support and emergency stop contacts published privately

## Go / No-Go

- [ ] All applicable blockers are closed or formally accepted by their owner
- [ ] Exact commit, extension ID, backend URL, token wave, and dates recorded
- [ ] External consent handoff tested before distribution
- [ ] Pilot size and duration are bounded
- [ ] Rollback package and backend stop procedure are available
- [ ] Go decision recorded by `TODO(owner)` on `TODO(date)`

Any unchecked mandatory item means no-go.

## Stop Criteria

Stop distribution and ingestion when:

- consent or approved disclosures are unavailable or incorrect;
- tokens, participant mappings, databases, backups, or exports are exposed;
- denied/private data, credentials, hidden content, or unexpected fields appear;
- parser drift causes broad, missing, or misleading capture;
- upload failures risk loss or uncontrolled duplicate handling;
- withdrawal cannot be completed within the approved process; or
- the named decision owner directs a stop.

Pause capture where possible, revoke/rotate the wave token, preserve operational
evidence without copying payloads, and document the incident and next decision.

## Rollback

1. Stop extension distribution and backend ingestion.
2. Rotate/revoke the active wave token.
3. Tell active participants to pause or uninstall using approved communication.
4. Preserve restricted backups only as allowed by the approved plan.
5. Fix and re-run automated and live validation at a new commit.
6. Require a new recorded go/no-go decision.
