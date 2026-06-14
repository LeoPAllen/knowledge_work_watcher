# Data Retention And Withdrawal

Controlled pilot only. `TODO(IRB)`: approve the retention period, withdrawal
deadline, deletion promise, backup treatment, and participant-facing language.

## Data Locations

| Location | Contents | Deletion action |
| --- | --- | --- |
| Browser `chrome.storage.local` | Queue, dead letters, token, state | Clear controls or uninstall/profile removal |
| Backend SQLite | Validated raw events and participant hash | Hash-targeted deletion while backend is stopped |
| SQLite backups | Point-in-time raw database copies | Delete/expire every in-scope backup |
| ETL output directories | Minimized and sensitive CSVs | Delete or regenerate without withdrawn rows |
| External operations mapping | Participant ID/person/hash linkage | Follow approved mapping-retention policy |

The local queue may be empty after successful sync because acknowledged events
are removed. Uninstalling does not remove uploaded or derived copies.

## Backup

1. Stop backend ingestion and confirm the database is not in use.
2. Run `npm run backup:sqlite -- --input <db> --output-dir <restricted-dir>`.
3. Keep the SQLite, WAL, and SHM set together with restrictive permissions.
4. Record date, source, operator, checksum, retention class, and restore test.
5. Never store backups in Git, shared project drives, or unmanaged devices.

## Withdrawal Intake

1. Verify the request through the approved external study process.
2. Resolve the participant to the stored SHA-256 hash using the restricted
   mapping. Do not pass a raw participant ID to repository scripts.
3. Record request date, scope, operator, and `TODO(IRB)` completion deadline.
4. Pause distribution/ingestion if identity or deletion scope is uncertain.

## Delete Uploaded Events

With the backend stopped and after an approved backup decision:

```sh
npm run delete:participant -- \
  --input /srv/kww/data/events.sqlite \
  --participant-hash <64-lowercase-hex>
```

Review the dry-run count. Execute only after authorization:

```sh
npm run delete:participant -- \
  --input /srv/kww/data/events.sqlite \
  --participant-hash <64-lowercase-hex> \
  --execute
```

The command uses secure deletion, checkpoints WAL, and vacuums the database.
Inspect aggregate counts afterward; do not print payloads.

## Derived Data And Backups

- Delete affected ETL directories or regenerate them from the cleaned database.
- Search all approved export locations by run manifest/date, not by raw content.
- Apply the approved policy to pre-deletion backups; deletion from the live
  database alone is not a complete withdrawal.
- Remove browser-local data with the participant if required by the approved
  process.
- Verify counts and document completion without copying event payloads.

## Withdrawal Record

Store outside this repository:

- request and verification dates;
- participant ID/hash reference under restricted access;
- databases, backups, exports, and devices reviewed;
- dry-run and post-delete counts;
- operator and approver;
- unresolved copies or exceptions; and
- completion communication under `TODO(IRB)` approved language.
