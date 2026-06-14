# Controlled-Pilot Deployment

Controlled pilot only. Not Chrome Web Store ready. External consent must be
completed before extension distribution.

## Prerequisites

- Node.js 24, npm, `zip`, `unzip`, Chrome, and an HTTPS-capable host
- Restricted operator access to configuration, SQLite, backups, and exports
- `TODO(IRB)`: replace participant-facing text with approved language
- Named owners for deployment, consent, participant support, and data handling

## Local Unpacked Test

```sh
npm ci
cp .env.example .env
set -a; source .env; set +a
npm run backend:start
```

Load `extension/` from `chrome://extensions` in developer mode. Configure a
synthetic participant, `http://localhost:3000`, the local token, and upload.
Loopback HTTP is for development only.

## Controlled Remote Pilot

1. Provision a restricted host with TLS and a dedicated service account.
2. Set the environment without committing `.env`:

   ```text
   KWW_BIND_HOST=127.0.0.1
   KWW_PORT=3000
   KWW_STORAGE_PATH=/srv/kww/data/events.sqlite
   KWW_STUDY_TOKEN=<high-entropy-wave-token>
   KWW_MAX_PAYLOAD_BYTES=262144
   KWW_CORS_ALLOWED_ORIGIN=chrome-extension://<pilot-extension-id>
   ```

3. Put an HTTPS reverse proxy in front of the loopback-bound backend.
4. Restrict filesystem access to the service account and named operators.
5. Package with `npm run package:extension`; distribute only the reviewed ZIP.
6. Complete external consent before giving installation/configuration details.
7. Configure the HTTPS origin, assigned participant ID, and wave token.
8. Run the go/no-go checklist in `docs/pilot-readiness.md`.

Do not expose the Node listener directly. Non-localhost extension uploads
require HTTPS and an exact runtime origin grant.

## Participant Tokens

The MVP accepts one `KWW_STUDY_TOKEN` per backend process. Use a unique,
high-entropy token per pilot wave, transmit it separately from the extension
package, and rotate it between waves or after suspected disclosure.

Per-participant authentication and independent token revocation are not
implemented. A study requiring either must not proceed until that blocker is
resolved. See `docs/participant-operations.md`.

## Start And Stop

Start after loading the deployment environment:

```sh
npm run backend:start
```

Stop through the process supervisor, then confirm no backend process is using
the SQLite files before backup, restore, or participant deletion. Record the
commit, package checksum, extension ID, and backend URL for each deployment.

## SQLite Operations

Default development storage is `backend/data/events.sqlite`. Pilot storage
should be outside the repository.

```sh
npm run inspect:events -- --input /srv/kww/data/events.sqlite
npm run backup:sqlite -- \
  --input /srv/kww/data/events.sqlite \
  --output-dir /srv/kww/backups
```

Run backup with the backend stopped. Keep the reported SQLite, WAL, and SHM
files together. Restrict backup access and test restoration on an isolated host:

1. Stop the test backend.
2. Copy one backup set to a new restricted directory.
3. Rename files back to `events.sqlite`, `events.sqlite-wal`, and
   `events.sqlite-shm`.
4. Run `npm run inspect:events -- --input <restored-path>`.
5. Start a test backend and check `/health`; do not use participant tokens.

## ETL And Packaging

```sh
npm run etl -- \
  --input /srv/kww/data/events.sqlite \
  --output /srv/kww/exports/run-YYYYMMDD
npm run package:extension
```

ETL exports contain sensitive study data. Store them outside the repository,
restrict access, and follow `docs/data-retention-withdrawal.md`.

## Never Commit

- `.env`, tokens, certificates, private keys, or deployment credentials
- SQLite, WAL, SHM, backup, queue export, or participant-mapping files
- ETL exports, participant records, browser profiles, or support screenshots

## Chrome Web Store Not-Ready

- [ ] Approved store listing, disclosures, and privacy policy
- [ ] Approved consent and participant-facing language
- [ ] Production authentication and token lifecycle
- [ ] Reviewed retention, withdrawal, deletion, and incident procedures
- [ ] Store package signing/versioning and update strategy
- [ ] Independent security/privacy review
- [ ] Live parser validation at the release commit

Until all applicable items are approved, distribute only as a controlled,
unpacked pilot build.
