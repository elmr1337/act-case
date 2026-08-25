import type { FormField } from "./dto";

/**
 * CSV in en uit, zonder dependency.
 *
 * Excel in Nederland gebruikt de puntkomma als scheidingsteken; een
 * komma-CSV belandt daar in één kolom. We exporteren daarom met `;` en een
 * BOM (anders maakt Excel er Latin-1 van), en bij het inlezen kijken we
 * gewoon welk teken het vaakst voorkomt.
 */

const BOM = "﻿";
const EXPORT_DELIMITER = ";";

function escapeCell(value: string, delimiter: string): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][], delimiter = EXPORT_DELIMITER): string {
  return (
    BOM +
    rows
      .map((row) => row.map((cell) => escapeCell(cell ?? "", delimiter)).join(delimiter))
      .join("\r\n")
  );
}

/** Kiest het scheidingsteken dat buiten aanhalingstekens het vaakst voorkomt. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let inQuotes = false;
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };

  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char in counts) counts[char] += 1;
  }

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Volledige parser: aanhalingstekens, verdubbelde quotes, en regeleindes
 * binnen een cel. Een regel-voor-regel `split` zou daarop stuklopen.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Volledig lege regels (bijv. een laatste enter) horen er niet bij.
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

/**
 * Het voorbeeldbestand: kolomkoppen zijn de labels die de gebruiker in het
 * formulier ziet, plus één ingevulde voorbeeldregel zodat meteen duidelijk is
 * wat er verwacht wordt.
 */
export function buildTemplateCsv(fields: FormField[]): string {
  const header = fields.map((field) =>
    field.required ? `${field.label} *` : field.label,
  );
  const example = fields.map((field) => exampleValue(field));
  return toCsv([header, example]);
}

function exampleValue(field: FormField): string {
  switch (field.kind) {
    case "select":
      return field.options?.[0]?.label ?? "";
    case "image":
    case "video":
    case "url":
      return "https://";
    case "color":
      return "#1a2b3c";
    case "number":
      return "1";
    case "boolean":
      return "ja";
    default:
      return `Voorbeeld ${field.label.toLowerCase()}`;
  }
}

/** `Kop *` → `kop`, zodat een sterretje of hoofdletter niets uitmaakt. */
function normalize(value: string): string {
  return value
    .replace(/\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type ColumnMapping = {
  /** Per kolomindex het veld waar hij bij hoort (of null als we het niet weten). */
  columns: Array<FormField | null>;
  /** Verplichte velden waarvoor geen kolom gevonden is. */
  missingRequired: FormField[];
  /** Kolomkoppen die we niet konden thuisbrengen. */
  unknownHeaders: string[];
};

/** Koppelt kolomkoppen aan velden — op label, en anders op de ruwe parameternaam. */
export function mapColumns(headers: string[], fields: FormField[]): ColumnMapping {
  const byLabel = new Map(fields.map((field) => [normalize(field.label), field]));
  const byName = new Map(fields.map((field) => [normalize(field.name), field]));

  const used = new Set<string>();
  const unknownHeaders: string[] = [];

  const columns = headers.map((header) => {
    const key = normalize(header);
    const field = byLabel.get(key) ?? byName.get(key) ?? null;
    if (field) used.add(field.name);
    else if (header.trim()) unknownHeaders.push(header.trim());
    return field;
  });

  return {
    columns,
    missingRequired: fields.filter((field) => field.required && !used.has(field.name)),
    unknownHeaders,
  };
}

export type ParsedRow = {
  /** Regelnummer zoals in het bestand, kop meegeteld. */
  line: number;
  parameters: Record<string, string>;
  /** Waar de gebruiker de regel aan herkent. */
  label: string;
  errors: string[];
};

/**
 * Zet de gelezen regels om naar wat de API verwacht. Een keuzeveld mag met het
 * label ingevuld worden ("Groen") — de UUID die Storyteq wil zoeken we hier op.
 */
export function rowsToParameters(
  rows: string[][],
  mapping: ColumnMapping,
  fields: FormField[],
): ParsedRow[] {
  const [, ...dataRows] = rows;

  return dataRows.map((cells, index) => {
    const parameters: Record<string, string> = {};
    const errors: string[] = [];

    mapping.columns.forEach((field, column) => {
      if (!field) return;
      const raw = (cells[column] ?? "").trim();
      if (!raw) return;

      if (field.kind === "select") {
        const option = field.options?.find(
          (candidate) =>
            normalize(candidate.label) === normalize(raw) || candidate.value === raw,
        );
        if (!option) {
          const choices = (field.options ?? []).map((o) => o.label).join(", ");
          errors.push(`"${raw}" is geen geldige keuze bij ${field.label} (${choices})`);
          return;
        }
        parameters[field.name] = option.value;
        return;
      }

      if (field.kind === "boolean") {
        parameters[field.name] = /^(ja|yes|true|1|waar)$/i.test(raw) ? "true" : "false";
        return;
      }

      parameters[field.name] = raw;
    });

    for (const field of fields) {
      if (field.required && !parameters[field.name]) {
        errors.push(`${field.label} is verplicht`);
      }
    }

    const label =
      fields
        .filter((field) => field.kind === "text" || field.kind === "longtext")
        .map((field) => parameters[field.name])
        .find((value) => value) ?? `Regel ${index + 2}`;

    return { line: index + 2, parameters, label, errors };
  });
}
