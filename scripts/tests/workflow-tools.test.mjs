import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  packageExtension,
  validatePackageEntries,
} from "../../extension/scripts/package-extension.mjs";
import {
  checkRepositoryPolicy,
  checkTrackedPaths,
  findHighConfidenceSecrets,
} from "../check-repository-policy.mjs";

test("repository policy rejects real-data paths and high-confidence secrets", () => {
  assert.deepEqual(
    checkTrackedPaths([
      "docs/data-inventory.md",
      "participant-data/person.json",
      "backend/data/events.sqlite",
    ]),
    ["participant-data/person.json", "backend/data/events.sqlite"],
  );
  assert.deepEqual(
    findHighConfidenceSecrets(
      "config.txt",
      "KWW_STUDY_TOKEN=synthetic-token-value",
    ),
    [],
  );
  assert.deepEqual(
    findHighConfidenceSecrets(
      "config.txt",
      ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
    ),
    ["config.txt: private key"],
  );
});

test("current tracked repository passes the policy check", async () => {
  assert.deepEqual(await checkRepositoryPolicy(), []);
});

test("package entry policy permits runtime extension files only", () => {
  assert.deepEqual(
    validatePackageEntries([
      "src/background/service-worker.mjs",
      "manifest.json",
      "src/",
    ]),
    [
      "manifest.json",
      "src/",
      "src/background/service-worker.mjs",
    ],
  );
  assert.throws(
    () =>
      validatePackageEntries([
        "manifest.json",
        "src/background/service-worker.mjs",
        "tests/private.json",
      ]),
    /invalid entry/,
  );
  assert.throws(
    () => validatePackageEntries(["manifest.json"]),
    /missing runtime source files/,
  );
});

test("extension package contains no tests, scripts, or documentation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kww-package-"));
  try {
    const result = await packageExtension(join(directory, "extension.zip"));
    const manifest = JSON.parse(
      await readFile("extension/manifest.json", "utf8"),
    );
    assert.equal(result.version, manifest.version);
    assert.equal(result.entries.includes("manifest.json"), true);
    assert.equal(
      result.entries.every(
        (entry) =>
          entry === "manifest.json" ||
          entry === "src/" ||
          entry.startsWith("src/"),
      ),
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
