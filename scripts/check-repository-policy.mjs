import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN_PREFIXES = [
  "backend/data/",
  "data/",
  "participant-data/",
  "research-exports/",
];
const SECRET_PATTERNS = [
  ["private key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/],
  ["OpenAI secret key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
];
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".txt",
  ".yml",
  ".yaml",
]);

function extensionFor(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

export function checkTrackedPaths(paths) {
  return paths.filter((path) =>
    FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix)),
  );
}

export function findHighConfidenceSecrets(path, content) {
  return SECRET_PATTERNS.filter(([, pattern]) => pattern.test(content)).map(
    ([kind]) => `${path}: ${kind}`,
  );
}

function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("git ls-files failed");
  }
  return result.stdout.split("\0").filter(Boolean);
}

export async function checkRepositoryPolicy(paths = trackedFiles()) {
  const errors = checkTrackedPaths(paths).map(
    (path) => `${path}: tracked real-data/output path`,
  );
  for (const path of paths) {
    if (
      !TEXT_EXTENSIONS.has(extensionFor(path)) &&
      ![".env.example", ".gitignore"].includes(path)
    ) {
      continue;
    }
    const content = await readFile(resolve(repositoryRoot, path), "utf8");
    errors.push(...findHighConfidenceSecrets(path, content));
  }
  return errors;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const errors = await checkRepositoryPolicy();
  if (errors.length > 0) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Repository policy valid: no tracked real-data paths or secrets.");
  }
}
