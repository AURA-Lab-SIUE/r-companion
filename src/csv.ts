// A small, correct CSV reader and writer for the data viewer and the codes file.
//
// RFC 4180 shape: fields split on commas, a field wrapped in double quotes may hold commas,
// newlines, and doubled "" quotes, and rows end on LF or CRLF. No dependency, so the unit tests
// load it directly. The viewer never writes the data file; the only file this writes is the long
// codes file, which the viewer fully controls, so the writer quotes defensively.

export interface ParsedCsv {
  header: string[];
  rows: string[][];
}

/** Parses CSV text into a header and string rows. Blank trailing lines are dropped. */
export function parseCsv(text: string): ParsedCsv {
  // Strip a UTF-8 BOM so the first header name is clean
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  let sawAny = false;
  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAny = true;
      i++;
      continue;
    }
    if (c === ',') {
      sawAny = true;
      endField();
      i++;
      continue;
    }
    if (c === '\r') {
      // Treat CRLF and a lone CR as one line end
      if (text[i + 1] === '\n') i++;
      endRecord();
      i++;
      sawAny = false;
      continue;
    }
    if (c === '\n') {
      endRecord();
      i++;
      sawAny = false;
      continue;
    }
    field += c;
    sawAny = true;
    i++;
  }
  // Flush the last field/record unless the file ended on a clean newline with nothing after
  if (inQuotes || field.length > 0 || record.length > 0 || sawAny) endRecord();
  const all = records.filter((r) => !(r.length === 1 && r[0] === ''));
  const header = all.shift() ?? [];
  return { header, rows: all };
}

/** Quotes one CSV field only when it must be (comma, quote, CR, or LF). */
export function csvField(value: string): string {
  if (value === '') return '';
  if (/[",\r\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

/** Writes a header and rows back to CSV text with CRLF line ends and a trailing newline. */
export function writeCsv(header: string[], rows: string[][]): string {
  const lines = [header.map(csvField).join(',')];
  for (const r of rows) lines.push(r.map(csvField).join(','));
  return lines.join('\r\n') + '\r\n';
}

export type ColumnType = 'integer' | 'number' | 'date' | 'logical' | 'text';

const INT_RE = /^[+-]?\d+$/;
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/;
const BOOL_RE = /^(true|false)$/i;

/**
 * Infers a column type from its values, ignoring blanks. Returns 'text' when the values are
 * mixed. Used only to pick the sort and filter kind and a right-aligned number column; the stored
 * value is always the original string, so inference never changes the data.
 */
export function inferType(values: string[]): ColumnType {
  let seen = 0;
  let allInt = true;
  let allNum = true;
  let allDate = true;
  let allBool = true;
  for (const v of values) {
    if (v === '' || v == null) continue;
    seen++;
    if (!INT_RE.test(v)) allInt = false;
    if (!NUM_RE.test(v)) allNum = false;
    if (!DATE_RE.test(v)) allDate = false;
    if (!BOOL_RE.test(v)) allBool = false;
    if (!allInt && !allNum && !allDate && !allBool) return 'text';
  }
  if (seen === 0) return 'text';
  if (allInt) return 'integer';
  if (allNum) return 'number';
  if (allDate) return 'date';
  if (allBool) return 'logical';
  return 'text';
}
