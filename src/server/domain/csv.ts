// Minimal RFC 4180 CSV reader/writer. Exports use ";" and a UTF-8 BOM so that
// they open correctly in a French Excel.

export const CSV_DELIMITER = ";";

export function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t"];
  let best = CSV_DELIMITER;
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(text.split(/\r?\n/, 1)[0] ?? "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop empty lines.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function escapeCell(value: string): string {
  // Prevent formula injection when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export type CsvValue = string | number | null | undefined;

export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [header, ...rows].map((cells) =>
    cells.map((cell) => escapeCell(cell === null || cell === undefined ? "" : String(cell))).join(CSV_DELIMITER),
  );
  return `﻿${lines.join("\r\n")}\r\n`;
}
