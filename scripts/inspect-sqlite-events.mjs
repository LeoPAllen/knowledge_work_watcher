import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectSqliteEvents } from "./lib/sqlite-operations.mjs";

function valueFor(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}

export function runInspectCli(args) {
  const unexpected = args.filter(
    (argument, index) => index % 2 === 0 && argument !== "--input",
  );
  if (unexpected.length > 0 || args.length !== 2) {
    throw new TypeError("Usage: --input <events.sqlite>");
  }
  return inspectSqliteEvents(valueFor(args, "--input"));
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const summary = runInspectCli(process.argv.slice(2));
    console.log(`Database: ${summary.path}`);
    console.log(`Tables: ${summary.tables.join(", ") || "none"}`);
    console.log(`Events: ${summary.totalEvents}`);
    console.log(`Participant hashes: ${summary.participantHashes}`);
    console.log(`Sensitive events: ${summary.sensitiveEvents}`);
    console.log("Events by type:");
    for (const [eventType, count] of Object.entries(summary.eventTypeCounts)) {
      console.log(`  ${eventType}: ${count}`);
    }
  } catch (error) {
    console.error(`Inspection failed: ${error.message}`);
    process.exitCode = 1;
  }
}
