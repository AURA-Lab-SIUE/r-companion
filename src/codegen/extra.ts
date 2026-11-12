// The rest of the small Write R code additions (audit 2026-11-12, fix F10; Coordinator go-ahead under
// owner q-20261112-0014): store one number with pull(), the five numbers of one column in their own
// item (Summary by group stays as it is, so deck output does not change), and a labeled factor.
import { lines, banner } from './house';
import { GenParams, Template } from './types';
import { rName } from './chosen';

const q = (v: string) => JSON.stringify(v);

/** filter() to one row (optional), then pull() one column out as plain values, stored by name. */
export function pullValue(data: string, result: string, column: string, filterCol?: string, value?: string, raw?: boolean): string {
  const c = rName(column);
  if (!filterCol) {
    return lines(
      banner(`Store ${column} as plain values`),
      `# pull() takes the ${column} column out of ${data} as plain values, and <- stores them as`,
      `# ${result}, so later lines can do arithmetic with them.`,
      `${result} <- ${data} %>%`,
      `  pull(${c})`,
      result,
    );
  }
  const f = rName(filterCol);
  const v = raw ? value ?? '' : q(value ?? '');
  return lines(
    banner(`Store one number: ${column} where ${filterCol} is ${value}`),
    `# filter() keeps the row where ${filterCol} is ${value}. pull() takes its ${column} out as a plain`,
    `# number, and <- stores it as ${result}, so later lines can do arithmetic with it.`,
    `${result} <- ${data} %>%`,
    `  filter(${f} == ${v}) %>%`,
    `  pull(${c})`,
    result,
  );
}

/** Total, smallest, middle, average, and biggest of one number column, in one row. */
export function fiveNumbers(data: string, column: string): string {
  const c = rName(column);
  return lines(
    banner(`Total, smallest, middle, average, and biggest of ${column}`),
    `# One row back. na.rm = TRUE skips rows with no ${column}. median() is the middle value once the`,
    '# values are sorted; mean() is the average.',
    `${data} %>%`,
    '  summarize(',
    `    total = sum(${c}, na.rm = TRUE),`,
    `    smallest = min(${c}, na.rm = TRUE),`,
    `    middle = median(${c}, na.rm = TRUE),`,
    `    average = mean(${c}, na.rm = TRUE),`,
    `    biggest = max(${c}, na.rm = TRUE)`,
    '  )',
  );
}

/** Split "0, 1" or "yes, no" into values; numbers stay bare, words get quotation marks. */
export function splitValues(text: string): { values: string[]; allNumbers: boolean } {
  const values = text.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return { values, allNumbers: values.length > 0 && values.every((v) => /^-?\d+(\.\d+)?$/.test(v)) };
}

/** Give a code column labels that say what each code means, then count it to check for NA. */
export function labeledFactor(data: string, column: string, levels: string, labels: string): string {
  const c = rName(column);
  const lv = splitValues(levels);
  const lb = splitValues(labels);
  const lvText = lv.values.map((v) => (lv.allNumbers ? v : q(v))).join(', ');
  const lbText = lb.values.map(q).join(', ');
  return lines(
    banner(`Label the codes in ${column}`),
    `# The codes in ${column} are names for groups, not amounts. factor() gives each code a label, in`,
    '# order: the first level gets the first label. A code not listed in levels becomes NA, so the',
    '# count below should show one row per label and no NA row.',
    `${data} <- ${data} %>%`,
    `  mutate(${c} = factor(${c}, levels = c(${lvText}), labels = c(${lbText})))`,
    '',
    `${data} %>%`,
    `  count(${c})`,
  );
}

const d = (p: GenParams, fallback: string) => p.data ?? fallback;

export const MC427_EXTRA: Record<string, Template> = {
  'pull-value': (p) => pullValue(d(p, 'df'), p.result ?? 'value', p.column ?? 'posts', p.columns?.[0], p.value, p.rawValue),
  'five-numbers': (p) => fiveNumbers(d(p, 'df'), p.column ?? 'posts'),
  'label-codes': (p) => labeledFactor(d(p, 'codes'), p.column ?? 'sentiment', p.value ?? '1, 0', p.labels ?? 'positive, negative'),
};

export const V2V_EXTRA: Record<string, Template> = {
  'pull-value': (p) => pullValue(d(p, 'analysis'), p.result ?? 'value', p.column ?? 'message_length', p.columns?.[0], p.value, p.rawValue),
  'five-numbers': (p) => fiveNumbers(d(p, 'analysis'), p.column ?? 'message_length'),
  'label-codes': (p) => labeledFactor(d(p, 'codes'), p.column ?? 'reaction_only', p.value ?? '0, 1', p.labels ?? 'commentary, reaction'),
};
