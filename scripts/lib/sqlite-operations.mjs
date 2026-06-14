import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const REQUIRED_COLUMNS = new Set([
  "id",
  "event_id",
  "schema_version",
  "event_type",
  "participant_id_hash",
  "received_at",
  "request_id",
  "raw_event_json",
]);

const SENSITIVE_EVENT_TYPES = new Set([
  "llm_response_text_observed",
  "search_snippet_observed",
  "search_result_full_url_observed",
]);

export function requireDatabasePath(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new TypeError("--input is required");
  }
  const path = resolve(input);
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new TypeError(`SQLite database not found: ${path}`);
  }
  return path;
}

function openDatabase(input, options = { readOnly: true }) {
  const path = requireDatabasePath(input);
  const database = new DatabaseSync(path, options);
  const columns = database
    .prepare("PRAGMA table_info(raw_events)")
    .all()
    .map((row) => row.name);
  if (
    columns.length === 0 ||
    [...REQUIRED_COLUMNS].some((column) => !columns.includes(column))
  ) {
    database.close();
    throw new TypeError("SQLite database does not contain the current raw_events schema");
  }
  return { database, path };
}

export function inspectSqliteEvents(input) {
  const { database, path } = openDatabase(input);
  try {
    const tables = database
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all()
      .map((row) => row.name);
    const eventTypeCounts = Object.fromEntries(
      database
        .prepare(
          `SELECT event_type, COUNT(*) AS count
           FROM raw_events
           GROUP BY event_type
           ORDER BY event_type`,
        )
        .all()
        .map((row) => [row.event_type, Number(row.count)]),
    );
    const totals = database
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COUNT(DISTINCT participant_id_hash) AS participants
         FROM raw_events`,
      )
      .get();
    const sensitiveEvents = Object.entries(eventTypeCounts)
      .filter(([eventType]) => SENSITIVE_EVENT_TYPES.has(eventType))
      .reduce((total, [, count]) => total + count, 0);
    return {
      path,
      tables,
      totalEvents: Number(totals.total),
      participantHashes: Number(totals.participants),
      sensitiveEvents,
      eventTypeCounts,
    };
  } finally {
    database.close();
  }
}

function backupStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function backupSqlite(input, outputDirectory, now = new Date()) {
  const path = requireDatabasePath(input);
  inspectSqliteEvents(path);
  if (typeof outputDirectory !== "string" || outputDirectory.trim() === "") {
    throw new TypeError("--output-dir is required");
  }
  const outputDir = resolve(outputDirectory);
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const name = `${basename(path)}.${backupStamp(now)}`;
  const sources = [path, `${path}-wal`, `${path}-shm`].filter(existsSync);
  const outputs = [];
  try {
    for (const [index, source] of sources.entries()) {
      const suffix = index === 0 ? "" : source.slice(path.length);
      const target = join(outputDir, `${name}${suffix}`);
      copyFileSync(source, target, constants.COPYFILE_EXCL);
      chmodSync(target, 0o600);
      outputs.push(target);
    }
  } catch (error) {
    for (const output of outputs) {
      unlinkSync(output);
    }
    throw error;
  }
  return { source: path, outputs };
}

export function deleteParticipantEvents(
  input,
  participantHash,
  { execute = false } = {},
) {
  if (
    typeof participantHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(participantHash)
  ) {
    throw new TypeError("--participant-hash must be a lowercase SHA-256 hex value");
  }
  const { database, path } = openDatabase(input, { readOnly: !execute });
  try {
    const before = Number(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM raw_events WHERE participant_id_hash = ?",
        )
        .get(participantHash).count,
    );
    if (!execute) {
      return { path, participantHash, execute, before, deleted: 0, after: before };
    }

    database.exec("PRAGMA secure_delete = ON; BEGIN IMMEDIATE;");
    try {
      database
        .prepare("DELETE FROM raw_events WHERE participant_id_hash = ?")
        .run(participantHash);
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
    database.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
    const after = Number(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM raw_events WHERE participant_id_hash = ?",
        )
        .get(participantHash).count,
    );
    return {
      path,
      participantHash,
      execute,
      before,
      deleted: before - after,
      after,
    };
  } finally {
    database.close();
  }
}
