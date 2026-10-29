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

/** The id stamp for codes keyed by row position (1, 2, 3, ...), when the data has no id column. */
export const ROW_NUMBER = 'row_number';

/** Is column `idx` usable as an id: present in every row, never blank, never repeated? */
function uniqueColumn(rows: string[][], idx: number): boolean {
  if (idx < 0) return false;
  const seen = new Set<string>();
  for (const r of rows) {
    const v = r[idx];
    if (v === undefined || v === '' || seen.has(v)) return false;
    seen.add(v);
  }
  return true;
}

/**
 * Decides the column that ties each code to its item. A `row_id` column first (the viewer's own),
 * then the item's own id: a column named `id`, or else the first one ending in `_id` (tweet_id,
 * video_id). Each must be present, unique, and never blank. With none, the codes are keyed by row
 * position, which only holds while the file keeps its row order. Kept pure for the unit tests.
 *
 * `legacy` gives the 0.5.4 rule (row_id, else row position), for a codes file written before the
 * id stamp existed, so its codes stay on the rows they were entered on.
 */
export function chooseRowId(header: string[], rows: string[][], legacy = false): { field: string; synthesize: boolean } {
  if (uniqueColumn(rows, header.indexOf(ROW_ID))) return { field: ROW_ID, synthesize: false };
  if (!legacy) {
    if (uniqueColumn(rows, header.indexOf('id'))) return { field: 'id', synthesize: false };
    const named = header.find((h, i) => /_id$/i.test(h) && uniqueColumn(rows, i));
    if (named) return { field: named, synthesize: false };
  }
  return { field: ROW_ID, synthesize: true };
}
