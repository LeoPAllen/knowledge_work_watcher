import { resolve } from "node:path";
import { runEtl } from "./index.mjs";

function parseArgs(args) {
  const values = {
    inputPath: null,
    outputPath: "research-exports",
    inactivityMinutes: 30,
    linkWindowMinutes: 30,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || !flag.startsWith("--")) {
      throw new TypeError(`Missing value for ${flag}`);
    }
    index += 1;
    if (flag === "--input") {
      values.inputPath = value;
    } else if (flag === "--output") {
      values.outputPath = value;
    } else if (flag === "--inactivity-minutes") {
      values.inactivityMinutes = Number(value);
    } else if (flag === "--link-window-minutes") {
      values.linkWindowMinutes = Number(value);
    } else {
      throw new TypeError(`Unknown argument: ${flag}`);
    }
  }
  if (!values.inputPath) {
    throw new TypeError("--input is required");
  }
  return values;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = await runEtl({
    ...options,
    inputPath: resolve(options.inputPath),
    outputPath: resolve(options.outputPath),
  });
  console.log(`Validated input events: ${result.inputRowCount}`);
  console.log("Rows by event type:");
  for (const [eventType, count] of Object.entries(
    result.quality.eventTypeCounts,
  )) {
    if (count > 0) {
      console.log(`  ${eventType}: ${count}`);
    }
  }
  console.log("Output rows:");
  for (const [name, count] of Object.entries(result.rowCounts)) {
    console.log(`  ${name}: ${count}`);
  }
  console.log(
    `Missing event types: ${result.quality.missingEventTypes.join(", ") || "none"}`,
  );
  console.log(`Quality warnings: ${result.quality.warnings.length}`);
} catch (error) {
  console.error(`ETL failed: ${error.message}`);
  process.exitCode = 1;
}
