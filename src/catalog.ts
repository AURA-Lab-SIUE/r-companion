// The Write R code menu catalog: every task, its plain-English label, and which course offers it.
// Moved out of menus.ts in 0.5.3 so the AURA panel and the unit tests read the same list with no
// VS Code API.

import { CourseId } from './profiles';
import { hasTask, GenProfile, apaTask } from './codegen';

export interface TaskDef {
  task: string;
  label: string;
  category: string;
  /** A column-choosing task: probe the data and pick columns. */
  columns?: 'one' | 'many';
  /** A file-writing task: ask for the output name. */
  outFile?: boolean;
  alternative?: boolean;
}

// The menu catalog. hasTask(profile, task) decides which of these a course actually offers.
export const CATALOG: TaskDef[] = [
  { task: 'import-csv', label: 'Import a data file (CSV or Excel)', category: 'R2 Data' },
  { task: 'import-course-dataset', label: 'Load the course Twitch corpus', category: 'R2 Data' },
  { task: 'import-rds', label: 'Load your saved analysis (RDS)', category: 'R2 Data' },
  { task: 'filter', label: 'Keep some rows (filter)', category: 'R2 Data', columns: 'one' },
  { task: 'select', label: 'Keep some columns (select)', category: 'R2 Data', columns: 'many' },
  { task: 'mutate', label: 'Add a column (mutate)', category: 'R2 Data' },
  { task: 'count', label: 'Count rows per group (count)', category: 'R2 Data', columns: 'one' },
  { task: 'clean-dates', label: 'Turn the date column into a time (clean_dates)', category: 'R2 Data' },
  { task: 'convert-timestamp', label: 'Turn the date column into a time (plain, no v2v)', category: 'R2 Data', alternative: true },
  { task: 'join-chat-streams', label: 'Match each message to its stream (join_chat_streams)', category: 'R2 Data' },
  { task: 'channel-lookup', label: 'Label each channel by its top category', category: 'R2 Data' },
  { task: 'join-lookup', label: 'Join the channel labels onto the messages', category: 'R2 Data' },
  { task: 'join-tables', label: 'Join two tables by a shared column', category: 'R2 Data' },
  { task: 'label-from-snapshot', label: 'Label each message per moment (alternative)', category: 'R2 Data', alternative: true },
  { task: 'export-csv', label: 'Save a table as a CSV file', category: 'R2 Data', outFile: true },
  { task: 'export-rds', label: 'Save a table as an RDS file', category: 'R2 Data', outFile: true },
  { task: 'reliability', label: 'Reliability grid and statistic', category: 'R2 Data' },
  { task: 'frequency', label: 'Frequency table', category: 'R3 Describe', columns: 'one' },
  { task: 'crosstab', label: 'Crosstab with proportions', category: 'R3 Describe' },
  { task: 'grouped-summary', label: 'Summary by group', category: 'R3 Describe' },
  { task: 'bar', label: 'Bar chart', category: 'R3 Describe' },
  { task: 'histogram', label: 'Histogram', category: 'R3 Describe' },
  { task: 'histogram-grouped', label: 'Histogram comparing two groups', category: 'R3 Describe', alternative: true },
  { task: 'line', label: 'Line chart over time', category: 'R3 Describe' },
  { task: 'boxplot', label: 'Boxplot', category: 'R3 Describe' },
  { task: 'settings-block', label: 'Settings block (name the test variables)', category: 'R4 Test' },
  { task: 't-test', label: 'Welch t-test with Cohen\'s d', category: 'R4 Test' },
  { task: 't-test-missing', label: 'Welch t-test, dropping missing values', category: 'R4 Test' },
  { task: 'chi-square', label: 'Chi-square test with Cramer\'s V', category: 'R4 Test' },
  { task: 'anova', label: 'One-way ANOVA with eta squared', category: 'R4 Test' },
  { task: 'regression', label: 'Linear regression', category: 'R4 Test' },
  { task: 'correlation', label: 'Correlation', category: 'R4 Test' },
  { task: 'power', label: 'Power analysis for your sample size', category: 'R4 Test' },
  { task: 'check-test-choice', label: 'Check my test choice', category: 'R4 Test' },
  { task: 'apa-check', label: 'APA numbers to check your sentence', category: 'R4 Test' },
];


// The R4 tasks MC 427 offers as a check on Copilot's code under U2 ("cross-check")
export const R4_TEST_TASKS = new Set(['t-test', 't-test-missing', 'chi-square', 'anova', 'regression', 'correlation', 'apa-check']);

export function profileOf(course: CourseId): GenProfile {
  return course;
}

export function offers(profile: GenProfile, task: string, apaCheck: boolean): boolean {
  if (task === 'check-test-choice') return true;
  if (task === 'apa-check') return apaCheck && hasTask(profile, apaTask('t-test'));
  return hasTask(profile, task);
}

/** The Write R code items a course offers, in menu order (the integration suites pick by index). */
export function menuTasks(profile: GenProfile, apaCheck: boolean): string[] {
  return CATALOG.filter((t) => offers(profile, t.task, apaCheck)).map((t) => t.task);
}

/** The same items with their labels and categories, for the AURA panel. */
export function menuItems(profile: GenProfile, apaCheck: boolean): { task: string; label: string; category: string; alternative?: boolean }[] {
  return CATALOG.filter((t) => offers(profile, t.task, apaCheck)).map(({ task, label, category, alternative }) => ({ task, label, category, alternative }));
}
