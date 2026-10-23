// Code-generation types shared across the R2/R3/R4 templates (workstream E, #rgui).

/** The code profile: one per course. */
export type GenProfile = 'mc427' | 'mc451' | 'mc501';

export type Release = 'R2' | 'R3' | 'R4';

/**
 * Parameters a wizard collects. Every field is optional and defaults to the golden value, so
 * generate(profile, task) with no params reproduces the golden fixture byte for byte, and a
 * wizard overrides only what the student chose (file name, columns, filter value, labels).
 */
export interface GenParams {
  /** The data frame the block reads or changes (df, analysis, chat, pilot, ...). */
  data?: string;
  /** The result name a step assigns (next_posts, gaming, chat_streams, ...). */
  result?: string;
  /** A file path (read or written). */
  file?: string;
  /** A single column the step acts on. */
  column?: string;
  /** Several columns (select, summarize). */
  columns?: string[];
  /** A value for a filter predicate. */
  value?: string;
  /** Write value as it is (TRUE, FALSE, a number), not in quotation marks. */
  rawValue?: boolean;
  /** The Excel sheet an import reads. */
  sheet?: string;
  /** Add janitor::clean_names() after the read (MC 451 and MC 501, when a column name needs it). */
  cleanNames?: boolean;
  /** The second table of a join (the one columns are taken from). */
  right?: string;
  /** Join with inner_join(): keep only the rows that match on both sides. */
  keepOnlyMatches?: boolean;
}

/** A template: golden-reproducing when given no overrides. */
export type Template = (params: GenParams) => string;

/**
 * The R4 test tasks resolved from the per-course table (MC451_R4 / MC501_R4) rather than the
 * shared V2V_R4. Most render each rubric's form in both courses; `power` lives only in MC501_R4,
 * so routing through here makes MC 501 offer it and MC 451 (no MC451_R4['power']) not.
 */
export const PER_PROFILE_R4 = new Set(['t-test', 't-test-missing', 'chi-square', 'anova', 'regression', 'correlation', 'power']);
