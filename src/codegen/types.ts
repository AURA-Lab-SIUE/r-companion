// Code-generation types shared across the R2/R3/R4 templates (workstream E, #rgui).

import { V2vVersion } from './house';

/** The code profile. v2v-plain holds the proposed plain-call variants (q-20261018-0044). */
export type GenProfile = 'mc427' | 'mc451' | 'mc501' | 'v2v-plain';

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
  /** A text value for a filter predicate. */
  value?: string;
}

export interface GenOptions {
  /** The installed v2v version. Default 0.3.2 (the golden baseline). */
  v2vVersion?: V2vVersion;
  /**
   * Write the plain calls the v2v wrappers stand for (t.test, chisq.test, effectsize,
   * irr::kappa2) instead of the wrappers, with the wrapper last as a check. Owner
   * q-20261018-0044 = A: the extension's auraR.plainCalls setting defaults to true. The generator
   * default stays false so the golden wrapper fixtures keep reproducing byte for byte.
   */
  plainCalls?: boolean;
}

/** A template: golden-reproducing when given no overrides. */
export type Template = (params: GenParams, opts: Required<GenOptions>) => string;

export const DEFAULT_OPTIONS: Required<GenOptions> = {
  v2vVersion: '0.3.2',
  plainCalls: false,
};

/** The R4 test tasks that MC 451 and MC 501 each render in their own rubric's form. */
export const PER_PROFILE_R4 = new Set(['t-test', 't-test-missing', 'chi-square', 'anova', 'regression', 'correlation']);
