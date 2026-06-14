import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(extensionRoot, "..");

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
      } else {
        reject(
          new Error(
            `${command} failed with code ${code}: ${stderr.trim() || stdout.trim()}`,
          ),
        );
      }
    });
  });
}

export function validatePackageEntries(entries) {
  const normalized = entries.filter(Boolean).sort();
  if (!normalized.includes("manifest.json")) {
    throw new TypeError("extension package is missing manifest.json");
  }
  if (!normalized.some((entry) => entry.startsWith("src/") && entry !== "src/")) {
    throw new TypeError("extension package is missing runtime source files");
  }
  const invalid = normalized.filter(
    (entry) =>
      entry !== "manifest.json" &&
      entry !== "src/" &&
      !entry.startsWith("src/"),
  );
  if (invalid.length > 0) {
    throw new TypeError(`extension package contains invalid entry: ${invalid[0]}`);
  }
  return normalized;
}

export async function packageExtension(outputPath) {
  const manifest = JSON.parse(
    await readFile(resolve(extensionRoot, "manifest.json"), "utf8"),
  );
  const target =
    outputPath ??
    resolve(
      repositoryRoot,
      "dist",
      `knowledge-work-watcher-${manifest.version}.zip`,
    );
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { force: true });
  await run(
    "zip",
    ["-X", "-q", "-r", target, "manifest.json", "src"],
    { cwd: extensionRoot },
  );
  const entries = validatePackageEntries(
    (await run("unzip", ["-Z1", target])).split(/\r?\n/),
  );
  return { target, entries, version: manifest.version };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const outputFlag = process.argv.indexOf("--output");
  const outputPath =
    outputFlag === -1 ? null : resolve(process.argv[outputFlag + 1] ?? "");
  if (outputFlag !== -1 && !process.argv[outputFlag + 1]) {
    throw new TypeError("--output requires a path");
  }
  const result = await packageExtension(outputPath);
  console.log(
    `Packaged ${basename(result.target)} with ${result.entries.length} runtime entries.`,
  );
}
