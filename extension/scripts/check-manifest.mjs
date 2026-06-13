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
  permissions.length !== 1 ||
  permissions[0] !== "storage"
) {
  errors.push("the only permitted extension permission is storage");
}

if ("host_permissions" in manifest || "optional_host_permissions" in manifest) {
  errors.push("host permissions must be omitted for the shell");
}

if ("content_scripts" in manifest) {
  errors.push("content scripts must be omitted for the shell");
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
    `Manifest valid: MV3, ${referencedFiles.length} referenced files, storage-only permission.`,
  );
}
