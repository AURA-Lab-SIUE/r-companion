// The long-format codes file: one row per coded cell, row_id, column, value, coded_at.
//
// The original data file is never written. All coding lives here, at
// data/derived/<name>-codes.csv. The writer is atomic (temp file then rename) so a VS Code that
// closes mid-write never leaves a half file, and rows are sorted for a stable diff.

import * as fs from 'fs';
import * as path from 'path';
import { parseCsv, writeCsv } from './csv';
import { CodeRecord } from './dataTypes';

export const CODES_HEADER = ['row_id', 'column', 'value', 'coded_at'];

/** Sorts records by column then numeric-or-text row id, for a diff that does not churn. */
function sortRecords(records: CodeRecord[]): CodeRecord[] {
  return [...records].sort((a, b) => {
    if (a.column !== b.column) return a.column < b.column ? -1 : 1;
    const na = Number(a.rowId);
    const nb = Number(b.rowId);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0;
  });
}

export function serializeCodes(records: CodeRecord[]): string {
  const rows = sortRecords(records).map((r) => [r.rowId, r.column, r.value, r.codedAt]);
  return writeCsv(CODES_HEADER, rows);
}

export function parseCodes(text: string): CodeRecord[] {
  const { header, rows } = parseCsv(text);
  const col = (name: string) => header.indexOf(name);
  const ri = col('row_id');
  const ci = col('column');
  const vi = col('value');
  const ai = col('coded_at');
  if (ri < 0 || ci < 0 || vi < 0) return [];
  return rows.map((r) => ({
    rowId: r[ri] ?? '',
    column: r[ci] ?? '',
    value: r[vi] ?? '',
    codedAt: ai >= 0 ? (r[ai] ?? '') : '',
  }));
}

/** In-memory codes keyed by row id then column, with the atomic file behind it. */
export class CodeStore {
  // rowId -> column -> {value, codedAt}
  private cells = new Map<string, Map<string, { value: string; codedAt: string }>>();

  constructor(readonly filePath: string) {}

  static load(filePath: string): CodeStore {
    const store = new CodeStore(filePath);
    if (fs.existsSync(filePath)) {
      for (const rec of parseCodes(fs.readFileSync(filePath, 'utf8'))) {
        if (rec.value === '') continue;
        store.put(rec.rowId, rec.column, rec.value, rec.codedAt);
      }
    }
    return store;
  }

  private put(rowId: string, column: string, value: string, codedAt: string) {
    let row = this.cells.get(rowId);
    if (!row) {
      row = new Map();
      this.cells.set(rowId, row);
    }
    row.set(column, { value, codedAt });
  }

  /** Records a value. An empty value clears the cell (removes the record). */
  set(rowId: string, column: string, value: string, codedAt: string) {
    if (value === '') {
      this.cells.get(rowId)?.delete(column);
      return;
    }
    this.put(rowId, column, value, codedAt);
  }

  /** Every stored value for one row, as a plain object, for sending the grid its coded cells. */
  rowValues(rowId: string): Record<string, string> {
    const out: Record<string, string> = {};
    const row = this.cells.get(rowId);
    if (row) for (const [col, cell] of row) out[col] = cell.value;
    return out;
  }

  /** Columns that have at least one value, in first-seen order of the file is not kept; sorted. */
  columnsWithData(): string[] {
    const set = new Set<string>();
    for (const row of this.cells.values()) for (const col of row.keys()) set.add(col);
    return [...set].sort();
  }

  toRecords(): CodeRecord[] {
    const out: CodeRecord[] = [];
    for (const [rowId, row] of this.cells) {
      for (const [column, cell] of row) out.push({ rowId, column, value: cell.value, codedAt: cell.codedAt });
    }
    return out;
  }

  /** Writes the file atomically: a temp file in the same folder, then a rename over the target. */
  save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + `.tmp-${process.pid}`;
    fs.writeFileSync(tmp, serializeCodes(this.toRecords()));
    fs.renameSync(tmp, this.filePath);
  }
}
