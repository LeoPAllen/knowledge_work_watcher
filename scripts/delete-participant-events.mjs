import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteParticipantEvents } from "./lib/sqlite-operations.mjs";

function parseArgs(args) {
  const options = { input: null, participantHash: null, execute: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--execute") {
      options.execute = true;
      continue;
    }
    const value = args[index + 1];
    if (!value) {
      throw new TypeError(`Missing value for ${flag}`);
    }
    index += 1;
    if (flag === "--input") {
      options.input = value;
    } else if (flag === "--participant-hash") {
      options.participantHash = value;
    } else {
      throw new TypeError(`Unknown argument: ${flag}`);
    }
  }
  return options;
}

export function runDeleteCli(args) {
  const options = parseArgs(args);
  return deleteParticipantEvents(options.input, options.participantHash, {
    execute: options.execute,
  });
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const result = runDeleteCli(process.argv.slice(2));
    console.log(`Database: ${result.path}`);
    console.log(`Matching events before: ${result.before}`);
    if (!result.execute) {
      console.log("Dry run only. Re-run with --execute after approval and backup.");
    } else {
      console.log(`Deleted events: ${result.deleted}`);
      console.log(`Matching events after: ${result.after}`);
      console.log("Delete or regenerate derived ETL exports and review backups.");
    }
  } catch (error) {
    console.error(`Participant deletion failed: ${error.message}`);
    process.exitCode = 1;
  }
}
