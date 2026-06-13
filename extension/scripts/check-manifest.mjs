import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(extensionRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const errors = [];
const referencedFiles = [
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  manifest.options_page,
  ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? []),
].filter(Boolean);

if (manifest.manifest_version !== 3) {
  errors.push("manifest_version must be 3");
}

if (!manifest.name || !manifest.version) {
  errors.push("name and version are required");
}

if (manifest.background?.type !== "module") {
  errors.push("background service worker must use module type");
}

const permissions = manifest.permissions ?? [];
if (
  !Array.isArray(permissions) ||
  permissions.length !== 2 ||
  !permissions.includes("storage") ||
  !permissions.includes("webNavigation")
) {
  errors.push("the only permitted extension permissions are storage and webNavigation");
}

const expectedHosts = [
  "https://www.google.com/*",
  "https://www.bing.com/*",
  "https://duckduckgo.com/*",
];
if (
  JSON.stringify(manifest.host_permissions) !== JSON.stringify(expectedHosts)
) {
  errors.push("host permissions must match the three approved search hosts");
}

if ("optional_host_permissions" in manifest) {
  errors.push("optional host permissions must be omitted");
}

const [searchScript] = manifest.content_scripts ?? [];
if (
  manifest.content_scripts?.length !== 1 ||
  JSON.stringify(searchScript.matches) !==
    JSON.stringify([
      "https://www.google.com/search*",
      "https://www.bing.com/search*",
      "https://duckduckgo.com/*",
    ]) ||
  JSON.stringify(searchScript.include_globs) !==
    JSON.stringify([
      "https://duckduckgo.com/?*",
      "https://duckduckgo.com/html/*",
      "https://www.google.com/search*",
      "https://www.bing.com/search*",
    ]) ||
  searchScript.run_at !== "document_idle" ||
  searchScript.all_frames !== false
) {
  errors.push("content scripts must remain scoped to approved top-frame search pages");
}

for (const file of referencedFiles) {
  try {
    await access(resolve(extensionRoot, file));
  } catch {
    errors.push(`referenced file does not exist: ${file}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Manifest valid: MV3, ${referencedFiles.length} referenced files, minimal permissions.`,
  );
}
