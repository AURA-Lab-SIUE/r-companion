// Import a data file (CSV or Excel), 0.5.3 (#rgui): the pure parts of the Data menu's import,
// with no VS Code API, so the unit tests load this file directly. The menu (menus.ts) asks for the
// file, the table name, and the Excel sheet, shows a peek from the column probe, then writes the
// Load block from the codegen templates.

import * as path from 'path';
import { ColumnProbe } from './columnProbe';

export type DataFileKind = 'csv' | 'excel' | 'rds';

export function dataFileKind(file: string): DataFileKind | undefined {
  if (/\.csv$/i.test(file)) return 'csv';
  if (/\.xlsx?$/i.test(file)) return 'excel';
  if (/\.rds$/i.test(file)) return 'rds';
  return undefined;
}

/**
 * A table name made from the file name: letters, digits, and underscores, starting with a letter
 * (reliability-pilot.csv gives reliability_pilot, "2024 Codes.xlsx" gives data_2024_codes).
 */
export function tableNameFromFile(file: string): string {
  const base = path.basename(file).replace(/\.[^.]+$/, '');
  let name = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!name) return 'data';
  if (!/^[a-z]/.test(name)) name = `data_${name}`;
  return name;
}

/** Why a typed table name will not work in R, or undefined when it will. */
export function tableNameProblem(name: string): string | undefined {
  if (!name) return 'Type a name.';
  if (!/^[A-Za-z]/.test(name)) return 'Start the name with a letter.';
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return 'Use only letters, digits, and underscores (no spaces).';
  if (RESERVED.has(name)) return `${name} is a word R keeps for itself. Pick another name.`;
  return undefined;
}

const RESERVED = new Set(['if', 'else', 'repeat', 'while', 'function', 'for', 'next', 'break', 'TRUE', 'FALSE', 'NULL', 'Inf', 'NaN', 'NA', 'in']);

/**
 * The path written into the script: relative to the course folder, with forward slashes, when the
 * file is inside it; otherwise the absolute path (forward slashes, which R reads on every system).
 */
export function scriptPath(file: string, folder?: string): { path: string; outside: boolean } {
  const abs = path.resolve(file);
  if (folder) {
    const rel = path.relative(path.resolve(folder), abs);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return { path: rel.replace(/\\/g, '/'), outside: false };
  }
  return { path: abs.replace(/\\/g, '/'), outside: true };
}

export const OUTSIDE_NOTICE =
  'This file is outside your course folder, so the path in your script only works on this computer. Copy it into data/ to keep the project portable.';

/** The R expression the column probe reads the chosen file with. */
export function probeExpr(file: string, sheet?: string): string {
  const p = JSON.stringify(file.replace(/\\/g, '/'));
  switch (dataFileKind(file)) {
    case 'excel':
      return sheet ? `readxl::read_excel(${p}, sheet = ${JSON.stringify(sheet)})` : `readxl::read_excel(${p})`;
    case 'rds':
      return `readRDS(${p})`;
    default:
      return `readr::read_csv(${p}, show_col_types = FALSE)`;
  }
}

/** The R that lists an Excel workbook's sheets into a JSON file (never the console). */
export function sheetListExpr(file: string, out: string): string {
  const p = JSON.stringify(file.replace(/\\/g, '/'));
  return `jsonlite::write_json(readxl::excel_sheets(${p}), ${JSON.stringify(out.replace(/\\/g, '/'))})`;
}

const TYPE_WORD: Record<string, string> = {
  chr: 'text',
  dbl: 'number',
  int: 'whole number',
  lgl: 'TRUE or FALSE',
  fct: 'category',
  dttm: 'date and time',
  date: 'date',
};

export function typeWord(type: string): string {
  return TYPE_WORD[type] ?? type;
}

const comma = (n: number) => n.toLocaleString('en-US');

/** The peek's title line: "12 columns, 1,350 rows: channel (text), pass_1 (text), ..." */
export function peekSummary(probe: ColumnProbe, shown = 6): string {
  const cols = probe.columns.map((c) => `${c.name} (${typeWord(c.type)})`);
  const head = cols.slice(0, shown).join(', ') + (cols.length > shown ? ', ...' : '');
  const n = probe.columns.length;
  return `${n} column${n === 1 ? '' : 's'}, ${comma(probe.rows)} row${probe.rows === 1 ? '' : 's'}: ${head}`;
}

/**
 * Column names janitor::clean_names() would change: spaces, capitals, or other characters that make
 * a name need backticks in R. MC 451 and MC 501 only (janitor is required there; MC 427 does not
 * install it).
 */
export function namesNeedCleaning(probe: ColumnProbe): string[] {
  return probe.columns.map((c) => c.name).filter((n) => !/^[a-z][a-z0-9_]*$/.test(n));
}
