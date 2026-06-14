import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  backupSqlite,
  deleteParticipantEvents,
  inspectSqliteEvents,
} from "../lib/sqlite-operations.mjs";

function fixtureDatabase(directory) {
  const path = join(directory, "events.sqlite");
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE raw_events (
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
  const insert = database.prepare(`
    INSERT INTO raw_events (
      event_id, schema_version, event_type, participant_id_hash,
      received_at, request_id, raw_event_json
    ) VALUES (?, 2, ?, ?, '2026-06-14T12:00:00.000Z', 'request', ?)
  `);
  const firstHash = "a".repeat(64);
  const secondHash = "b".repeat(64);
  insert.run(
    "event-1",
    "queue_test_event",
    firstHash,
    JSON.stringify({ payload: { marker: "raw-sensitive-marker" } }),
  );
  insert.run(
    "event-2",
    "llm_response_text_observed",
    firstHash,
    JSON.stringify({ payload: { response_text: "private response" } }),
  );
  insert.run("event-3", "queue_test_event", secondHash, "{}");
  return { database, path, firstHash, secondHash };
}

test("missing and wrong-schema databases fail safely", () => {
  const directory = mkdtempSync(join(tmpdir(), "kww-ops-"));
  try {
    const missing = join(directory, "missing.sqlite");
    assert.throws(
      () => inspectSqliteEvents(missing),
      /not found/,
    );
    assert.throws(() => backupSqlite(missing, join(directory, "backup")), /not found/);
    const wrong = join(directory, "wrong.sqlite");
    new DatabaseSync(wrong).close();
    assert.throws(() => inspectSqliteEvents(wrong), /raw_events schema/);
    assert.throws(
      () => deleteParticipantEvents(wrong, "a".repeat(64)),
      /raw_events schema/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("inspection returns counts without raw payload values", () => {
  const directory = mkdtempSync(join(tmpdir(), "kww-ops-"));
  const fixture = fixtureDatabase(directory);
  try {
    const summary = inspectSqliteEvents(fixture.path);
    assert.equal(summary.totalEvents, 3);
    assert.equal(summary.participantHashes, 2);
    assert.equal(summary.sensitiveEvents, 1);
    assert.equal(summary.eventTypeCounts.queue_test_event, 2);
    assert.doesNotMatch(JSON.stringify(summary), /raw-sensitive-marker|private response/);
  } finally {
    fixture.database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backup copies the SQLite database and present WAL/SHM files", () => {
  const directory = mkdtempSync(join(tmpdir(), "kww-ops-"));
  const fixture = fixtureDatabase(directory);
  try {
    assert.equal(existsSync(`${fixture.path}-wal`), true);
    assert.equal(existsSync(`${fixture.path}-shm`), true);
    const result = backupSqlite(
      fixture.path,
      join(directory, "backup"),
      new Date("2026-06-14T12:00:00.000Z"),
    );
    assert.equal(result.outputs.length, 3);
    assert.equal(result.outputs.every(existsSync), true);
    assert.equal(readFileSync(result.outputs[1]).length > 0, true);
    assert.throws(
      () =>
        backupSqlite(
          fixture.path,
          join(directory, "backup"),
          new Date("2026-06-14T12:00:00.000Z"),
        ),
      /EEXIST/,
    );
  } finally {
    fixture.database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("participant deletion is dry-run by default and executes by hash only", () => {
  const directory = mkdtempSync(join(tmpdir(), "kww-ops-"));
  const fixture = fixtureDatabase(directory);
  fixture.database.close();
  try {
    const dryRun = deleteParticipantEvents(fixture.path, fixture.firstHash);
    assert.deepEqual(
      { execute: dryRun.execute, before: dryRun.before, after: dryRun.after },
      { execute: false, before: 2, after: 2 },
    );
    assert.throws(
      () => deleteParticipantEvents(fixture.path, "participant-001"),
      /SHA-256/,
    );
    const executed = deleteParticipantEvents(fixture.path, fixture.firstHash, {
      execute: true,
    });
    assert.equal(executed.deleted, 2);
    assert.equal(executed.after, 0);
    assert.equal(inspectSqliteEvents(fixture.path).totalEvents, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
