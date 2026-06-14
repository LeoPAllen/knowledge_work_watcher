import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backupSqlite } from "./lib/sqlite-operations.mjs";

function parseArgs(args) {
  const options = { input: null, outputDirectory: null };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) {
      throw new TypeError(`Missing value for ${flag}`);
    }
    if (flag === "--input") {
      options.input = value;
    } else if (flag === "--output-dir") {
      options.outputDirectory = value;
    } else {
      throw new TypeError(`Unknown argument: ${flag}`);
    }
  }
  return options;
}

export function runBackupCli(args, now = new Date()) {
  const options = parseArgs(args);
  return backupSqlite(options.input, options.outputDirectory, now);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const result = runBackupCli(process.argv.slice(2));
    console.log("Backup complete. Keep these files together:");
    for (const path of result.outputs) {
      console.log(`  ${path}`);
    }
  } catch (error) {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
