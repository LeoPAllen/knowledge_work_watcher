import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { EventStorage } from "../../backend/src/storage.mjs";
import { rowsToCsv } from "../src/csv.mjs";
import { readInput } from "../src/input.mjs";
import { runEtl } from "../src/index.mjs";
import { assertSafeOutputs, validateRecords } from "../src/quality.mjs";
import { sessionize } from "../src/sessionize.mjs";
import { transformRecords } from "../src/transform.mjs";

const fixture = resolve("research-etl/fixtures/synthetic-events.jsonl");

test("synthetic fixture produces expected analysis tables", async () => {
  const result = await runEtl({
    inputPath: fixture,
    writeOutputs: false,
  });

  assert.equal(result.inputRowCount, 15);
  assert.deepEqual(result.rowCounts, {
    events_clean: 15,
    page_views: 4,
    search_episodes: 1,
    llm_episodes: 1,
    knowledge_exposures: 5,
    downstream_navigation: 2,
    solution_assembly_trace: 15,
  });
  assert.deepEqual(
    result.tables.downstream_navigation.rows.map((row) => row.source_type),
    ["search", "llm"],
  );
  assert.deepEqual(
    new Set(result.tables.events_clean.rows.map((row) => row.source_type)),
    new Set(["search", "llm", "docs", "code", "qna", "encyclopedia"]),
  );
  assert.equal(
    new Set(
      result.tables.events_clean.rows
        .filter(
          (row) =>
            row.participant_id_hash ===
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        )
        .map((row) => row.activity_session_id),
    ).size,
    2,
  );
});

test("output is deterministic and writes all CSV files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kww-etl-"));
  try {
    const first = await runEtl({
      inputPath: fixture,
      outputPath: directory,
    });
    const second = await runEtl({
      inputPath: fixture,
      writeOutputs: false,
    });
    assert.deepEqual(first.csv, second.csv);
    assert.deepEqual(
      (await readdir(directory)).sort(),
      Object.keys(first.tables)
        .map((name) => `${name}.csv`)
        .sort(),
    );
    assert.equal(
      await readFile(join(directory, "events_clean.csv"), "utf8"),
      first.csv.events_clean,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite input matches the synthetic JSONL input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kww-etl-db-"));
  const databasePath = join(directory, "events.sqlite");
  const records = await readInput(fixture);
  const storage = new EventStorage(databasePath);
  try {
    for (const record of records) {
      assert.deepEqual(
        storage.append(record.event, {
          receivedAt: record.received_at,
          requestId: record.request_id,
        }),
        { accepted: true },
      );
    }
  } finally {
    storage.close();
  }

  try {
    const jsonl = await runEtl({
      inputPath: fixture,
      writeOutputs: false,
    });
    const sqlite = await runEtl({
      inputPath: databasePath,
      writeOutputs: false,
    });
    assert.deepEqual(sqlite.csv, jsonl.csv);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("quality checks reject duplicates and unsupported schema versions", async () => {
  const records = await readInput(fixture);
  assert.throws(
    () => validateRecords([records[0], records[0]]),
    /Duplicate event_id/,
  );
  const unsupported = structuredClone(records[0]);
  unsupported.event.schema_version = 2;
  assert.throws(
    () => validateRecords([unsupported]),
    /Unsupported schema version/,
  );
});

test("invalid timestamps and secret-like values are rejected", async () => {
  const records = await readInput(fixture);
  const invalidTime = structuredClone(records[0]);
  invalidTime.event.created_at = "not-a-timestamp";
  assert.throws(() => validateRecords([invalidTime]), /Invalid event/);

  const secret = structuredClone(records[0]);
  secret.event.event_id = "secret-output-check";
  secret.event.payload.query = "api_key=synthetic-value";
  assert.throws(
    () => validateRecords([secret]),
    /Invalid event/,
  );
  assert.throws(
    () =>
      assertSafeOutputs({
        synthetic: {
          rows: [{ text_value: "api_key=synthetic-value" }],
        },
      }),
    /Secret-like value/,
  );
});

test("private skip records cannot leak URLs or titles", async () => {
  const records = await readInput(fixture);
  const skipped = structuredClone(records[0]);
  skipped.event = {
    ...skipped.event,
    event_id: "private-skip",
    event_type: "capture_skipped",
    source: "telemetry",
    payload: {
      signal_type: "navigation_committed",
      classification: "private_or_sensitive",
      reason: "sensitive_domain",
      category: "banking",
    },
  };
  validateRecords([skipped]);
  const tables = transformRecords(sessionize([skipped]));
  assert.doesNotMatch(JSON.stringify(tables), /https?:|bank\.example/i);

  skipped.event.payload.url = "https://bank.example/account";
  assert.throws(
    () => validateRecords([skipped]),
    /Invalid event/,
  );
});

test("CSV output neutralizes spreadsheet formulas", () => {
  const csv = rowsToCsv(
    [
      { value: "=HYPERLINK(\"https://example.test\")" },
      { value: "  +SUM(1,2)" },
      { value: "@synthetic" },
      { value: "ordinary text" },
      { value: -5 },
    ],
    ["value"],
  );

  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"'  \+SUM/);
  assert.match(csv, /'@synthetic/);
  assert.match(csv, /ordinary text/);
  assert.match(csv, /\n-5\n/);
});
