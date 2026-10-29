// "Write this view as R" (code parity, 2026-10-28): the filters and sorts a student sets in the data
// viewer, written as dplyr, so the rows R keeps are the rows the grid showed, in the same order.
// Pure: no VS Code API, so the unit tests load it directly.
//
// Each rule copies how AG Grid 36.2 (media/grid) decides, read from its filter handlers:
//   - text filters ignore capitals, so the column and the typed text are both lower-cased;
//   - a blank cell fails "contains", "equals", "starts with", and "ends with", and passes "does not
//     contain" and "does not equal". read_csv() reads a blank cell as NA, so those two add is.na();
//   - number filters skip blank cells for every comparison, as R's filter() drops an NA, and
//     "between" leaves out both ends (AG Grid's inRangeInclusive is off);
//   - sorting puts blank cells last in both directions (the grid's comparators, media/grid/grid.js),
//     as arrange() does, and compares text letter by letter, as arrange() does in its "C" locale.

export interface ViewColumn {
  field: string;
  /** 'number' or 'integer' for a number column; anything else is text. */
  type: string;
}

interface Condition {
  filterType?: string;
  type?: string;
  filter?: string | number | null;
  filterTo?: string | number | null;
}

interface Combined {
  filterType?: string;
  operator: 'AND' | 'OR';
  conditions: Condition[];
}

export type FilterModel = Record<string, Condition | Combined>;
export interface SortItem {
  colId: string;
  sort: 'asc' | 'desc';
}

export interface ViewInputs {
  /** The R object the view starts from, already made by the steps above (coded_data), or undefined. */
  fromObject?: string;
  /** Otherwise the file is read: its path relative to the workspace, forward slashes. */
  dataRelPath: string;
  /** A column read as text so a long id keeps every digit (the rebuild block's rule). */
  textIdColumn?: string;
  /** The viewer numbered the rows itself (no id column in the data). */
  addedRowId: boolean;
  name: string;
  columns: ViewColumn[];
  filterModel: FilterModel;
  sort: SortItem[];
  /** The number of rows the grid showed, printed beside the check. */
  shownRows: number;
}

function q(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** A column name as R reads it in dplyr: bare when it is a plain name, else in backticks. */
function col(name: string): string {
  return /^[A-Za-z.][A-Za-z0-9._]*$/.test(name) && !/^\.\d/.test(name) ? name : '`' + name.replace(/`/g, '\\`') + '`';
}

function num(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`"${v}" is not a number`);
  return String(n);
}

/** One condition as an R test plus a plain-words comment. */
function condition(field: string, isNumber: boolean, c: Condition): { r: string; words: string } {
  const x = col(field);
  const type = c.type ?? '';
  if (type === 'blank') return { r: `is.na(${x})`, words: `${field} is blank` };
  if (type === 'notBlank') return { r: `!is.na(${x})`, words: `${field} is not blank` };
  if (isNumber) {
    const a = num(c.filter);
    switch (type) {
      case 'equals': return { r: `${x} == ${a}`, words: `${field} equals ${a}` };
      case 'notEqual': return { r: `${x} != ${a}`, words: `${field} does not equal ${a}` };
      case 'greaterThan': return { r: `${x} > ${a}`, words: `${field} is more than ${a}` };
      case 'greaterThanOrEqual': return { r: `${x} >= ${a}`, words: `${field} is ${a} or more` };
      case 'lessThan': return { r: `${x} < ${a}`, words: `${field} is less than ${a}` };
      case 'lessThanOrEqual': return { r: `${x} <= ${a}`, words: `${field} is ${a} or less` };
      case 'inRange': {
        const b = num(c.filterTo);
        return { r: `${x} > ${a} & ${x} < ${b}`, words: `${field} is between ${a} and ${b}, not counting the ends` };
      }
    }
    throw new Error(`the number filter "${type}" has no R version yet`);
  }
  const typed = String(c.filter ?? '');
  const t = q(typed.toLowerCase());
  const low = `str_to_lower(${x})`;
  switch (type) {
    case 'contains': return { r: `str_detect(${low}, fixed(${t}))`, words: `${field} contains ${q(typed)}` };
    case 'notContains': return { r: `is.na(${x}) | !str_detect(${low}, fixed(${t}))`, words: `${field} does not contain ${q(typed)}` };
    case 'equals': return { r: `${low} == ${t}`, words: `${field} is ${q(typed)}` };
    case 'notEqual': return { r: `is.na(${x}) | ${low} != ${t}`, words: `${field} is not ${q(typed)}` };
    case 'startsWith': return { r: `str_starts(${low}, fixed(${t}))`, words: `${field} starts with ${q(typed)}` };
    case 'endsWith': return { r: `str_ends(${low}, fixed(${t}))`, words: `${field} ends with ${q(typed)}` };
  }
  throw new Error(`the text filter "${type}" has no R version yet`);
}

/** The filter() lines for one column (one condition, or two joined by and/or). */
function columnFilter(field: string, isNumber: boolean, m: Condition | Combined): { r: string; words: string } {
  if ('conditions' in m && Array.isArray(m.conditions)) {
    const parts = m.conditions.map((c) => condition(field, isNumber, c));
    const join = m.operator === 'OR' ? ' | ' : ' & ';
    return {
      r: parts.map((p) => `(${p.r})`).join(join),
      words: parts.map((p) => p.words).join(m.operator === 'OR' ? ', or ' : ', and '),
    };
  }
  return condition(field, isNumber, m as Condition);
}

/** True when the view filters or sorts on anything. */
export function viewIsSet(filterModel: FilterModel | undefined, sort: SortItem[] | undefined): boolean {
  return Object.keys(filterModel ?? {}).length > 0 || (sort ?? []).length > 0;
}

/** The object name for a view of `name`: coding-sample becomes coding_sample_view. */
export function viewObjectName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'data';
  return (/^[a-z]/.test(base) ? base : `x_${base}`) + '_view';
}

export function viewToR(input: ViewInputs): string {
  const types = new Map(input.columns.map((c) => [c.field, c.type === 'number' || c.type === 'integer']));
  const object = viewObjectName(input.name);
  const used = new Set([...Object.keys(input.filterModel), ...input.sort.map((s) => s.colId)]);
  const needsRowId = input.addedRowId && used.has('row_id');
  const lines: string[] = [];
  lines.push(`# ---- The view you set in the data viewer: ${input.name} ----`);
  lines.push('# The rows you filtered to, in the order you sorted them. Filtering a view changes no file.');
  lines.push('# Generated by the AURA Lab R Companion.');
  lines.push('');
  lines.push('library(tidyverse)');
  lines.push('');
  const steps: string[] = [];
  if (input.fromObject) {
    steps.push(`${object} <- ${input.fromObject} %>%`);
  } else if (input.textIdColumn) {
    steps.push(`${object} <- read_csv(${q(input.dataRelPath)}, col_types = cols(${col(input.textIdColumn)} = col_character())) %>%`);
  } else {
    steps.push(`${object} <- read_csv(${q(input.dataRelPath)}) %>%`);
  }
  if (needsRowId) {
    steps.push('  # the viewer numbered your rows, because your data has no id column');
    steps.push('  mutate(row_id = as.numeric(row_number())) %>%');
  } else if (input.addedRowId && input.fromObject && used.has('row_id')) {
    steps.push('  mutate(row_id = as.numeric(row_id)) %>%');
  }
  for (const [field, m] of Object.entries(input.filterModel)) {
    const f = columnFilter(field, types.get(field) ?? false, m);
    steps.push(`  # keep the rows where ${f.words}${types.get(field) ? '' : ' (capitals do not matter)'}`);
    steps.push(`  filter(${f.r}) %>%`);
  }
  if (input.sort.length) {
    const by = input.sort.map((s) => (s.sort === 'desc' ? `desc(${col(s.colId)})` : col(s.colId)));
    const words = input.sort.map((s) => `${s.colId} ${s.sort === 'desc' ? 'largest first' : 'smallest first'}`).join(', then ');
    steps.push(`  # sort by ${words}; blank cells go last`);
    steps.push(`  arrange(${by.join(', ')}) %>%`);
  }
  // drop the trailing pipe on the last step
  steps[steps.length - 1] = steps[steps.length - 1].replace(/ %>%$/, '');
  lines.push(...steps);
  lines.push('');
  lines.push(`# The viewer showed ${input.shownRows.toLocaleString('en-US')} row(s); this prints the same number.`);
  lines.push(`nrow(${object})`);
  lines.push('');
  return lines.join('\n');
}
