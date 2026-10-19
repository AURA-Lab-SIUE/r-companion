// Shared shapes for the data viewer. Kept free of the VS Code API so the unit tests load it.

import { ColumnType } from './csv';

export interface DataColumn {
  field: string;
  type: ColumnType;
}

export interface CodingColumn {
  name: string;
  /** 'list' offers a dropdown of allowed values; 'free' is any text. */
  kind: 'list' | 'free';
  /** Allowed values for a 'list' column, in the order the student gave them. */
  values?: string[];
}

export interface LoadedData {
  /** Original data columns, in file order. The row id column, if synthesized, is first. */
  columns: DataColumn[];
  /** One object per row, keyed by column field; every value is the original string. */
  rows: Record<string, string>[];
  /** The column the codes file joins on. */
  rowIdField: string;
  /** True when the viewer added the row id column because the data had none. */
  addedRowId: boolean;
  /** A short name used for the codes file: data/derived/<name>-codes.csv. */
  name: string;
  /** Absolute path of the CSV the rebuild chunk reads (the original, or a derived snapshot). */
  sourcePath: string;
  /** How the data was loaded, for the report and the rebuild comment. */
  origin: 'csv' | 'rdataframe';
  /** For an R data frame, the expression that produced it (for the rebuild comment). */
  sourceExpr?: string;
}

/** One stored code cell, the long-format row written to the codes file. */
export interface CodeRecord {
  rowId: string;
  column: string;
  value: string;
  codedAt: string;
}

export const ROW_ID = 'row_id';

/**
 * Decides the row id column. Reuses an existing `row_id` column when it is present, unique, and has
 * no blanks; otherwise reports that one must be synthesized. Kept pure for the unit tests.
 */
export function chooseRowId(header: string[], rows: string[][]): { field: string; synthesize: boolean } {
  const idx = header.indexOf(ROW_ID);
  if (idx >= 0) {
    const seen = new Set<string>();
    let ok = true;
    for (const r of rows) {
      const v = r[idx];
      if (v === undefined || v === '' || seen.has(v)) {
        ok = false;
        break;
      }
      seen.add(v);
    }
    if (ok) return { field: ROW_ID, synthesize: false };
  }
  return { field: ROW_ID, synthesize: true };
}
