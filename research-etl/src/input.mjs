import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function normalizeRecord(record, line = null) {
  if (
    typeof record === "object" &&
    record !== null &&
    "event" in record
  ) {
    return {
      event: record.event,
      received_at: record.received_at ?? null,
      request_id: record.request_id ?? null,
      input_line: line,
    };
  }
  return {
    event: record,
    received_at: null,
    request_id: null,
    input_line: line,
  };
}

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line, index) => [line.trim(), index + 1])
    .filter(([line]) => line)
    .map(([line, lineNumber]) => {
      try {
        return normalizeRecord(JSON.parse(line), lineNumber);
      } catch {
        throw new TypeError(`Invalid JSON on line ${lineNumber}`);
      }
    });
}

function readSqlite(path) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return database
      .prepare(
        `SELECT raw_event_json, received_at, request_id
         FROM raw_events
         ORDER BY id`,
      )
      .all()
      .map((row) => ({
        event: JSON.parse(row.raw_event_json),
        received_at: row.received_at,
        request_id: row.request_id,
        input_line: null,
      }));
  } finally {
    database.close();
  }
}

export async function readInput(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".jsonl" || extension === ".ndjson") {
    return readJsonl(path);
  }
  if (extension === ".sqlite" || extension === ".db") {
    return readSqlite(path);
  }
  throw new TypeError("Input must be JSONL/NDJSON or SQLite");
}
