// Reliability code for the coding sheet and the reliability grid (code parity, 2026-10-28). Pure:
// no VS Code API, so the unit tests load it directly.

import { generate, GenProfile } from './codegen';

/** The pass 1 / pass 2 column pairs in a coding sheet: tone_p1 with tone_p2. */
export function passPairs(columns: string[]): PassPair[] {
  const set = new Set(columns);
  return columns
    .filter((c) => /_p1$/.test(c) && set.has(c.replace(/_p1$/, '_p2')))
    .map((c) => ({ variable: c.replace(/_p1$/, ''), first: c, second: c.replace(/_p1$/, '_p2') }));
}

/** A pass 1 / pass 2 column pair: the variable it checks, and its two columns. */
export interface PassPair {
  variable: string;
  first: string;
  second: string;
}

/**
 * The pair for two columns the student picked by hand (0.7.2): tone_p1 and tone_p2 check tone,
 * pass_1 and pass_2 check "codes". The name only labels the table the block makes, so it is made
 * safe for R.
 */
export function pairFromColumns(first: string, second: string): PassPair {
  const m1 = /^(.+?)_?p(?:ass)?_?1$/i.exec(first);
  const m2 = /^(.+?)_?p(?:ass)?_?2$/i.exec(second);
  const stem = m1 && m2 && m1[1].toLowerCase() === m2[1].toLowerCase() ? m1[1] : 'codes';
  const variable = stem.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z]+/, '') || 'codes';
  return { variable, first, second };
}

/**
 * Read the student's own file of two passes (0.7.2). Every column is read as text, so a long id
 * (a 19-digit post id) keeps every digit and a numbered code stays a code; the reliability block
 * only compares codes, so nothing needs a number.
 */
export function readPassesFile(name: string, file: string): string {
  return [
    `# ---- Read your two coding passes: ${file} ----`,
    'library(tidyverse)',
    '',
    '# Every column is read as text, so a long id keeps every digit and codes stay codes.',
    '# Prints nothing.',
    `${name} <- read_csv(`,
    `  "${file}",`,
    '  col_types = cols(.default = col_character())',
    ')',
    '',
    '# Look at every column: its name and its first values. Each pass should have its own column.',
    `glimpse(${name})`,
    '',
  ].join('\n');
}

/**
 * Keep the items coded in both passes, then the course's reliability block on them. `from` is the
 * table that holds both passes: the data viewer's coded_data, a file the student picked, or a
 * table their script made.
 */
export function reliabilityForPair(profile: GenProfile, p: PassPair, from = 'coded_data'): string {
  const table = `${p.variable}_passes`;
  const where =
    from === 'coded_data'
      ? '# coded_data is your coding sheet, from the rebuild block. An item you coded only once has NA in'
      : `# ${from} holds both passes. An item you coded only once has NA in`;
  const keep = [
    `# ---- Keep the items you coded in both passes: ${p.variable} ----`,
    // The check at the end calls v2v's reliability(), and a script that starts with the coding
    // sheet has not loaded v2v yet (found by scripts/verify-parity.mjs)
    ...(profile === 'mc427' ? [] : ['library(v2v)   # the course package, for reliability() below', '']),
    where,
    '# the other pass, so it is left out of the check. Prints nothing.',
    `${table} <- ${from} %>%`,
    `  filter(!is.na(${p.first}), !is.na(${p.second}))`,
    '',
  ].join('\n');
  return keep + '\n' + generate(profile, 'reliability', { data: table, columns: [p.first, p.second] });
}

/** The grid's saved file for one variable: data/derived/reliability-<variable>.csv. */
export function gridFileName(variable: string): string {
  return `reliability-${variable}.csv`;
}
