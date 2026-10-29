// Loading data for the viewer: a CSV file read directly, or an R data frame through an Rscript
// bridge that prints JSON. No VS Code API here, so the unit tests load the pure builder.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parseCsv, inferType, writeCsv, ParsedCsv, ColumnType } from './csv';
import { DataColumn, LoadedData, chooseRowId, ROW_ID, ROW_NUMBER } from './dataTypes';

/** Builds the viewer model from parsed CSV cells. Pure: synthesizes the row id when the data has none. */
export function buildLoaded(
  name: string,
  sourcePath: string,
  origin: LoadedData['origin'],
  parsed: ParsedCsv,
  sourceExpr?: string,
  idStamp?: string,
): LoadedData {
  const { header, rows } = parsed;
  // A codes file names the column its ids came from (the stamp); without one, the 0.5.4 rule
  const chosen =
    idStamp === ROW_NUMBER
      ? { field: ROW_ID, synthesize: true }
      : idStamp && header.includes(idStamp)
        ? { field: idStamp, synthesize: false }
        : chooseRowId(header, rows, idStamp === LEGACY);
  const { synthesize } = chosen;
  const columns: DataColumn[] = [];
  if (synthesize) columns.push({ field: ROW_ID, type: 'integer' });
  header.forEach((field, i) => {
    const values = rows.map((r) => r[i] ?? '');
    // The row id column always sorts and filters as an integer
    const type: ColumnType = field === chosen.field && !synthesize && INT_ID.test(values[0] ?? '') ? 'integer' : inferType(values);
    columns.push({ field, type });
  });
  const objects: Record<string, string>[] = rows.map((r, idx) => {
    const o: Record<string, string> = {};
    if (synthesize) o[ROW_ID] = String(idx + 1);
    header.forEach((field, i) => {
      o[field] = r[i] ?? '';
    });
    return o;
  });
  return { columns, rows: objects, rowIdField: chosen.field, addedRowId: synthesize, name, sourcePath, origin, sourceExpr };
}

/** The stamp that asks buildLoaded for the 0.5.4 key rule (a codes file from before the stamp). */
export const LEGACY = '(legacy)';

const INT_ID = /^[+-]?\d+$/;

/** The id stamp a codes file records for this data: the id column, or row_number. */
export function idStampOf(data: LoadedData): string {
  return data.addedRowId ? ROW_NUMBER : data.rowIdField;
}

/**
 * Columns of the data that are empty in every row, apart from the id. The coding sheet template
 * (one empty column per codebook variable) has them; the viewer turns each into a coding column.
 */
export function blankColumns(data: LoadedData): string[] {
  return data.columns
    .map((c) => c.field)
    .filter((f) => f !== data.rowIdField && data.rows.length > 0 && data.rows.every((r) => (r[f] ?? '') === ''));
}

/** Re-read already parsed data with another key (used when a codes file asks for one). */
export function rekey(data: LoadedData, idStamp: string): LoadedData {
  const fields = data.columns.map((c) => c.field).filter((f) => !(data.addedRowId && f === ROW_ID));
  const rows = data.rows.map((r) => fields.map((f) => r[f] ?? ''));
  return buildLoaded(data.name, data.sourcePath, data.origin, { header: fields, rows }, data.sourceExpr, idStamp);
}

/** Reads a CSV file from disk into the viewer model. */
export function loadCsvFile(filePath: string): LoadedData {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = parseCsv(text);
  const name = path.basename(filePath).replace(/\.[^.]+$/, '');
  return buildLoaded(name, filePath, 'csv', parsed);
}

export interface BridgeRow {
  columns: { name: string; type: string }[];
  data: Record<string, unknown>[];
}

/**
 * Runs bridge.R to turn an R expression (a data frame) into JSON, then writes a derived snapshot
 * CSV so the rebuild chunk has a file to read. Returns the viewer model. The snapshot lives under
 * data/derived and is the reproducibility anchor for an R data frame; the original R object is
 * never a file, so there is nothing of the student's to overwrite.
 */
export function loadRDataFrame(
  rscript: string,
  bridgeScript: string,
  expr: string,
  name: string,
  derivedDir: string,
  run: (cmd: string, args: string[]) => { code: number | null; stdout: string; stderr: string },
): LoadedData {
  const res = run(rscript, [bridgeScript, '--expr', expr]);
  let bridge: BridgeRow;
  try {
    bridge = JSON.parse(res.stdout.trim());
  } catch (e) {
    throw new Error(`The R bridge did not return readable data. R said: ${res.stderr.slice(0, 400)}`);
  }
  const header = bridge.columns.map((c) => c.name);
  const rows: string[][] = bridge.data.map((o) => header.map((h) => stringifyCell(o[h])));
  const parsed: ParsedCsv = { header, rows };
  fs.mkdirSync(derivedDir, { recursive: true });
  const snapshot = path.join(derivedDir, `${name}-source.csv`);
  fs.writeFileSync(snapshot, writeCsv(header, rows));
  return buildLoaded(name, snapshot, 'rdataframe', parsed, expr);
}

/** Turns an R/JSON cell into the viewer's string, matching how read_csv would print it. */
export function stringifyCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

/** Spawns Rscript synchronously for the bridge. Node's own child_process, no shell. */
export function runRscriptSync(cmd: string, args: string[]): { code: number | null; stdout: string; stderr: string } {
  const r = cp.spawnSync(cmd, ['--no-save', '--no-restore', ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
