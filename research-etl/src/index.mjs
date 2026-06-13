import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { rowsToCsv } from "./csv.mjs";
import { readInput } from "./input.mjs";
import { assertSafeOutputs, validateRecords } from "./quality.mjs";
import { sessionize } from "./sessionize.mjs";
import { transformRecords } from "./transform.mjs";

export async function runEtl({
  inputPath,
  outputPath,
  inactivityMinutes = 30,
  linkWindowMinutes = 30,
  writeOutputs = true,
}) {
  const input = await readInput(inputPath);
  const quality = validateRecords(input);
  const sessionized = sessionize(input, inactivityMinutes);
  const tables = transformRecords(sessionized, { linkWindowMinutes });
  assertSafeOutputs(tables);

  const csv = Object.fromEntries(
    Object.entries(tables).map(([name, table]) => [
      name,
      rowsToCsv(table.rows, table.columns),
    ]),
  );
  if (writeOutputs) {
    await mkdir(outputPath, { recursive: true });
    await Promise.all(
      Object.entries(csv).map(([name, content]) =>
        writeFile(join(outputPath, `${name}.csv`), content, "utf8"),
      ),
    );
  }
  return {
    inputRowCount: input.length,
    quality,
    tables,
    csv,
    rowCounts: Object.fromEntries(
      Object.entries(tables).map(([name, table]) => [name, table.rows.length]),
    ),
  };
}
