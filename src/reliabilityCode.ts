// Reliability code for the coding sheet and the reliability grid (code parity, 2026-10-28). Pure:
// no VS Code API, so the unit tests load it directly.

import { generate, GenProfile } from './codegen';

/** The pass 1 / pass 2 column pairs in a coding sheet: tone_p1 with tone_p2. */
export function passPairs(columns: string[]): { variable: string; first: string; second: string }[] {
  const set = new Set(columns);
  return columns
    .filter((c) => /_p1$/.test(c) && set.has(c.replace(/_p1$/, '_p2')))
    .map((c) => ({ variable: c.replace(/_p1$/, ''), first: c, second: c.replace(/_p1$/, '_p2') }));
}

/** Keep the items coded in both passes, then the course's reliability block on them. */
export function reliabilityForPair(profile: GenProfile, p: { variable: string; first: string; second: string }): string {
  const table = `${p.variable}_passes`;
  const keep = [
    `# ---- Keep the items you coded in both passes: ${p.variable} ----`,
    // The check at the end calls v2v's reliability(), and a script that starts with the coding
    // sheet has not loaded v2v yet (found by scripts/verify-parity.mjs)
    ...(profile === 'mc427' ? [] : ['library(v2v)   # the course package, for reliability() below', '']),
    '# coded_data is your coding sheet, from the rebuild block. An item you coded only once has NA in',
    '# the other pass, so it is left out of the check. Prints nothing.',
    `${table} <- coded_data %>%`,
    `  filter(!is.na(${p.first}), !is.na(${p.second}))`,
    '',
  ].join('\n');
  return keep + '\n' + generate(profile, 'reliability', { data: table, columns: [p.first, p.second] });
}

/** The grid's saved file for one variable: data/derived/reliability-<variable>.csv. */
export function gridFileName(variable: string): string {
  return `reliability-${variable}.csv`;
}
