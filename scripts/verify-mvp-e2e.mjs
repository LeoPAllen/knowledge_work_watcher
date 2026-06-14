import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildApp } from "../backend/src/app.mjs";
import { EventStorage } from "../backend/src/storage.mjs";
import { packageExtension } from "../extension/scripts/package-extension.mjs";
import { createUploadSync } from "../extension/src/background/upload-sync.mjs";
import { createEvent, SCHEMA_VERSION } from "../extension/src/shared/event-schema.mjs";
import { createLocalQueue } from "../extension/src/shared/local-queue.mjs";
import {
  createMemoryDeadLetterStorage,
  createMemoryStorageAdapter,
} from "../extension/src/shared/storage.mjs";
import { createMemorySyncStateStorage } from "../extension/src/shared/sync-state.mjs";
import { permissionPatternForServer } from "../extension/src/shared/upload-policy.mjs";
import { runEtl } from "../research-etl/src/index.mjs";
import { readInput } from "../research-etl/src/input.mjs";

const TOKEN = "synthetic-e2e-study-token";
const DATABASE_PATH = resolve("backend/data/e2e-events.sqlite");
const OUTPUT_PATH = resolve("research-exports/e2e");
const PACKAGE_PATH = resolve("dist/knowledge-work-watcher-e2e.zip");
const FIXTURE_PATH = resolve("research-etl/fixtures/synthetic-events.jsonl");

function eventTypeCounts(storage) {
  return Object.fromEntries(
    storage.database
      .prepare(
        `SELECT event_type, COUNT(*) AS count
         FROM raw_events
         GROUP BY event_type
         ORDER BY event_type`,
      )
      .all()
      .map((row) => [row.event_type, Number(row.count)]),
  );
}

function assertMinimizedSkippedEvent(storage) {
  const row = storage.database
    .prepare(
      `SELECT raw_event_json
       FROM raw_events
       WHERE event_type = 'capture_skipped'`,
    )
    .get();
  assert.ok(row, "capture_skipped event was not stored");
  const event = JSON.parse(row.raw_event_json);
  assert.deepEqual(Object.keys(event.payload).sort(), [
    "category",
    "classification",
    "reason",
    "signal_type",
  ]);
  assert.doesNotMatch(row.raw_event_json, /https?:\/\/|"title"\s*:/i);
}

async function resetArtifacts() {
  await Promise.all([
    rm(DATABASE_PATH, { force: true }),
    rm(`${DATABASE_PATH}-shm`, { force: true }),
    rm(`${DATABASE_PATH}-wal`, { force: true }),
    rm(OUTPUT_PATH, { recursive: true, force: true }),
    rm(PACKAGE_PATH, { force: true }),
  ]);
}

export async function verifyMvpE2e() {
  await resetArtifacts();
  const fixture = await readInput(FIXTURE_PATH);
  const participantIdHash = "a".repeat(64);
  const events = [
    ...fixture.map((record) => record.event),
    createEvent({
      eventType: "capture_skipped",
      extensionVersion: "0.1.0",
      captureMode: "ambient",
      source: "telemetry",
      participantIdHash,
      sessionId: "session-alpha",
      payload: {
        signal_type: "navigation_committed",
        classification: "private_or_sensitive",
        reason: "sensitive_domain",
        category: "banking",
      },
      eventId: "synthetic-private-skip",
      createdAt: "2026-06-13T12:15:00.000Z",
    }),
  ];
  const queue = createLocalQueue(createMemoryStorageAdapter(events), {
    deadLetterStorage: createMemoryDeadLetterStorage(),
  });
  const syncStateStorage = createMemorySyncStateStorage();
  const storage = new EventStorage(DATABASE_PATH);
  const app = buildApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      storagePath: DATABASE_PATH,
      studyToken: TOKEN,
      maxPayloadBytes: 256 * 1024,
      corsAllowedOrigin: null,
    },
    storage,
    logger: false,
  });

  let serverUrl;
  let syncState;
  let counts;
  try {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    assert.ok(address && typeof address === "object");
    serverUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${serverUrl}/health`);
    const schema = await fetch(`${serverUrl}/v1/schema/version`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, "ok");
    assert.equal(schema.status, 200);
    assert.equal((await schema.json()).schema_version, SCHEMA_VERSION);

    const expectedPermission = permissionPatternForServer(serverUrl);
    const upload = createUploadSync({
      stateController: {
        async getUploadContext() {
          return {
            consent_accepted: true,
            ambient_enabled: true,
            paused: false,
            upload_enabled: true,
            capture_status: "active",
            study_server_url: serverUrl,
            study_auth_token: TOKEN,
          };
        },
      },
      queue,
      syncStateStorage,
      alarms: {
        async create() {},
        async clear() {},
      },
      permissions: {
        async contains({ origins }) {
          return origins.length === 1 && origins[0] === expectedPermission;
        },
      },
      now: () => Date.parse("2026-06-14T12:00:00.000Z"),
    });

    const queuedBefore = (await queue.list()).length;
    syncState = await upload.syncNow();
    const queuedAfter = (await queue.list()).length;
    assert.equal(queuedBefore, events.length);
    assert.equal(syncState.status, "succeeded");
    assert.equal(syncState.last_accepted, events.length);
    assert.equal(syncState.last_rejected, 0);
    assert.equal(queuedAfter, 0);
    assert.equal((await queue.listDeadLetters()).length, 0);

    counts = eventTypeCounts(storage);
    assert.equal(
      Object.values(counts).reduce((total, count) => total + count, 0),
      events.length,
    );
    assertMinimizedSkippedEvent(storage);
  } finally {
    await app.close();
  }

  const etl = await runEtl({
    inputPath: DATABASE_PATH,
    outputPath: OUTPUT_PATH,
  });
  assert.equal(etl.inputRowCount, events.length);
  assert.equal(etl.rowCounts.events_clean, events.length);
  assert.equal(etl.quality.warnings.length, 0);

  const extensionPackage = await packageExtension(PACKAGE_PATH);
  const summary = {
    backend: {
      accepted: syncState.last_accepted,
      rejected: syncState.last_rejected,
      event_type_counts: counts,
      storage_path: DATABASE_PATH,
    },
    etl: {
      input_rows: etl.inputRowCount,
      output_path: OUTPUT_PATH,
      output_rows: etl.rowCounts,
    },
    package_path: extensionPackage.target,
    privacy: {
      synthetic_data_only: true,
      minimized_private_skip_verified: true,
      raw_payload_logging_enabled: false,
    },
  };
  await writeFile(
    resolve(OUTPUT_PATH, "verification-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  return summary;
}

if (resolve(process.argv[1] ?? "") === resolve(import.meta.filename)) {
  const summary = await verifyMvpE2e();
  console.log(JSON.stringify(summary, null, 2));
}
