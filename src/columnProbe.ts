// Reads the golden column probe's JSON (probe/column-probe.R) for the variable picker.
//
// The probe writes JSON to a file, never the console, so library-startup messages, .Rprofile
// output, and readr's column report cannot corrupt it (PACKAGE-COMPAT.md "The column probe").
// The picker reads that JSON here, NEVER scraped console text.

export interface ProbeColumn {
  name: string;
  /** The R class, e.g. "character", "numeric", "logical", "factor", "POSIXct". */
  class: string;
  /** The abbreviation glimpse() prints: dbl, chr, lgl, fct, dttm, date, int. */
  type: string;
  n_missing: number;
  n_distinct: number;
  /** Up to 12 values for text, logical, and factor columns; null otherwise. */
  values: string[] | null;
}

export interface ColumnProbe {
  rows: number;
  columns: ProbeColumn[];
}

/** Parse the probe JSON the extension's Rscript wrote. Throws on anything that is not a probe. */
export function parseColumnProbe(json: string): ColumnProbe {
  const obj = JSON.parse(json);
  if (!obj || obj.probe !== 1 || typeof obj.rows !== 'number' || !Array.isArray(obj.columns)) {
    throw new Error('Not a column probe: expected {"probe":1,"rows":...,"columns":[...]}.');
  }
  const columns: ProbeColumn[] = obj.columns.map((c: any) => ({
    name: String(c.name),
    class: String(c.class),
    type: String(c.type),
    n_missing: Number(c.n_missing),
    n_distinct: Number(c.n_distinct),
    values: Array.isArray(c.values) ? c.values.map(String) : null,
  }));
  return { rows: obj.rows, columns };
}

/** Numeric columns (dbl/int), for an outcome, a predictor, or a histogram. */
export function numericColumns(p: ColumnProbe): ProbeColumn[] {
  return p.columns.filter((c) => c.type === 'dbl' || c.type === 'int');
}

/** Columns a crosstab, bar, or grouped summary can group by (chr, lgl, fct, and small int). */
export function categoryColumns(p: ColumnProbe): ProbeColumn[] {
  return p.columns.filter((c) => c.type === 'chr' || c.type === 'lgl' || c.type === 'fct');
}

/**
 * Exactly-two-level columns, the ones a t-test needs. A logical such as voted_up shows up here
 * with values FALSE and TRUE, so the generator can write filter(voted_up), never a quoted string
 * (the "True" trap in MC 427 A02, PACKAGE-COMPAT.md).
 */
export function twoLevelColumns(p: ColumnProbe): ProbeColumn[] {
  return p.columns.filter((c) => c.values !== null && c.values.length === 2);
}

/**
 * An empty coded column reads as lgl with every row missing (the Module 4 worksheet's four code
 * columns). DT03 tells students that <lgl> means "fill it first", so the picker can say the same.
 */
export function emptyCodedColumns(p: ColumnProbe, rows = p.rows): ProbeColumn[] {
  return p.columns.filter((c) => c.type === 'lgl' && c.n_missing === rows);
}

/** A short "needs filling" note for a column the picker is about to offer, or undefined. */
export function pickerHint(c: ProbeColumn, rows: number): string | undefined {
  if (c.type === 'lgl' && c.n_missing === rows) return 'empty: fill it first';
  if (c.n_missing > 0) return `${c.n_missing} missing`;
  return undefined;
}
