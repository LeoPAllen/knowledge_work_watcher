function escapeCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const text =
    typeof value === "boolean" || typeof value === "number"
      ? String(value)
      : value;
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function rowsToCsv(rows, columns) {
  const lines = [
    columns.join(","),
    ...rows.map((row) =>
      columns.map((column) => escapeCell(row[column])).join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
