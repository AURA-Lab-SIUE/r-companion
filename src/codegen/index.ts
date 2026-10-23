// Code generation entry point (workstream E, #rgui).
//
// generate(profile, task, params, opts) returns the exact R a menu writes into the student's
// script, tested line for line against the golden fixtures (test/codegen.test.ts over
// manifest.json). The comment header on every block is kept on purpose (owner decision U1).

import { GenParams, GenOptions, GenProfile, Release, Template, DEFAULT_OPTIONS, PER_PROFILE_R4 } from './types';
import { MC427_R2, V2V_R2, V2V_PLAIN_R2 } from './r2';
import { MC427_R3, V2V_R3 } from './r3';
import { MC427_R4, V2V_R4, MC451_R4, MC501_R4, V2V_PLAIN_R4 } from './r4';
import { MC427_APA, V2V_APA } from './apa';

export { GenParams, GenOptions, GenProfile, Release } from './types';
export { APA_TESTS, ApaTest, apaTask } from './apa';

/** What release a task belongs to, for the quick-pick menus and the "behind a setting" gate. */
export const TASK_RELEASE: Record<string, Release> = {
  // R2 Data, wrangling, reliability
  'import-csv': 'R2', 'import-xlsx': 'R2', 'import-course-dataset': 'R2', 'import-rds': 'R2',
  filter: 'R2', select: 'R2', mutate: 'R2', count: 'R2',
  'clean-dates': 'R2', 'join-chat-streams': 'R2', 'channel-lookup': 'R2', 'join-lookup': 'R2', 'join-tables': 'R2',
  'convert-timestamp': 'R2', 'label-from-snapshot': 'R2',
  'export-csv': 'R2', 'export-rds': 'R2', reliability: 'R2',
  // R3 Describe and plots
  frequency: 'R3', crosstab: 'R3', 'grouped-summary': 'R3', bar: 'R3', histogram: 'R3',
  'histogram-grouped': 'R3', line: 'R3', boxplot: 'R3',
  // R4 Test
  't-test': 'R4', 't-test-missing': 'R4', 'chi-square': 'R4', anova: 'R4',
  regression: 'R4', correlation: 'R4', power: 'R4', 'settings-block': 'R4',
  // R4 APA numbers to check the student's sentence (0.4.0; owner decision U4)
  'apa-t-test': 'R4', 'apa-chi-square': 'R4', 'apa-anova': 'R4', 'apa-regression': 'R4', 'apa-correlation': 'R4',
};

const V2V_R2_R3: Record<string, Template> = { ...V2V_R2, ...V2V_R3 };

/**
 * Resolve the template for a (profile, task). MC 451 and MC 501 share the v2v R2/R3 files and the
 * settings block; they diverge only for the R4 test tasks, which each render in their rubric form.
 */
function resolve(profile: GenProfile, task: string): Template | undefined {
  switch (profile) {
    case 'mc427':
      return MC427_R2[task] ?? MC427_R3[task] ?? MC427_R4[task] ?? MC427_APA[task];
    case 'v2v-plain':
      return V2V_PLAIN_R2[task] ?? V2V_PLAIN_R4[task];
    case 'mc451':
      if (PER_PROFILE_R4.has(task)) return MC451_R4[task];
      return V2V_R2_R3[task] ?? V2V_R4[task] ?? V2V_APA[task];
    case 'mc501':
      if (PER_PROFILE_R4.has(task)) return MC501_R4[task];
      return V2V_R2_R3[task] ?? V2V_R4[task] ?? V2V_APA[task];
  }
}

/** Does this profile offer this task at all? */
export function hasTask(profile: GenProfile, task: string): boolean {
  return resolve(profile, task) !== undefined;
}

/**
 * Generate the R code block for a task. With no params/opts it reproduces the golden fixture
 * exactly; a wizard passes the columns, file, or labels the student chose.
 */
export function generate(
  profile: GenProfile,
  task: string,
  params: GenParams = {},
  opts: GenOptions = {},
): string {
  const tpl = resolve(profile, task);
  if (!tpl) throw new Error(`No code template for profile "${profile}", task "${task}".`);
  return tpl(params, { ...DEFAULT_OPTIONS, ...opts });
}
