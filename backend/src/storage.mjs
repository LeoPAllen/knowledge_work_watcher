import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function isDuplicate(error) {
  return (
    error?.code === "ERR_SQLITE_ERROR" &&
    String(error.message).includes("UNIQUE constraint failed")
  );
}

export class EventStorage {
  constructor(path) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    }
    this.database = new DatabaseSync(path);
    if (path !== ":memory:") {
      chmodSync(path, 0o600);
    }
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS raw_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        schema_version INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        participant_id_hash TEXT,
        received_at TEXT NOT NULL,
        request_id TEXT NOT NULL,
        raw_event_json TEXT NOT NULL
      ) STRICT;
    `);
    this.insert = this.database.prepare(`
      INSERT INTO raw_events (
        event_id,
        schema_version,
        event_type,
        participant_id_hash,
        received_at,
        request_id,
        raw_event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  }

  append(event, { receivedAt, requestId }) {
    try {
      this.insert.run(
        event.event_id,
        event.schema_version,
        event.event_type,
        event.participant_id_hash,
        receivedAt,
        requestId,
        JSON.stringify(event),
      );
      return { accepted: true };
    } catch (error) {
      if (isDuplicate(error)) {
        return { accepted: false, reason: "duplicate_event_id" };
      }
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}
