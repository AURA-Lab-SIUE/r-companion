// Loading data for the viewer: a CSV file read directly, or an R data frame through an Rscript
// bridge that prints JSON. No VS Code API here, so the unit tests load the pure builder.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parseCsv, inferType, writeCsv, ParsedCsv, ColumnType } from './csv';
import { DataColumn, LoadedData, chooseRowId, ROW_ID } from './dataTypes';

/** Builds the viewer model from parsed CSV cells. Pure: synthesizes the row id when the data has none. */
export function buildLoaded(
  name: string,
  sourcePath: string,
  origin: LoadedData['origin'],
  parsed: ParsedCsv,
  sourceExpr?: string,
): LoadedData {
  const { header, rows } = parsed;
  const { synthesize } = chooseRowId(header, rows);
  const columns: DataColumn[] = [];
  if (synthesize) columns.push({ field: ROW_ID, type: 'integer' });
  header.forEach((field, i) => {
    const values = rows.map((r) => r[i] ?? '');
    // The row id column always sorts and filters as an integer
    const type: ColumnType = field === ROW_ID && !synthesize ? 'integer' : inferType(values);
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
  return { columns, rows: objects, rowIdField: ROW_ID, addedRowId: synthesize, name, sourcePath, origin, sourceExpr };
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
