// R4 Test: code templates (workstream E, #rgui).
// MC 427 uses plain tidyverse + broom + effectsize; MC 451/MC 501 use the v2v wrappers the
// Inferencing rubrics name, each in its own rubric's form. v2v-plain holds the proposed plain
// calls the wrappers stand for (q-20261018-0044). Reproduces the golden fixtures byte for byte.

import { lines, banner } from './house';
import { GenParams, Template } from './types';

const d = (p: GenParams, def: string) => p.data ?? def;

// ---------------- MC 427 (plain tidyverse) ----------------

const mc427TTest: Template = (p) => {
  const data = d(p, 'df');
  return lines(
    banner('Welch t-test: like_count by share_button'),
    '# The size, mean, and standard deviation of each group. The write-up needs all three,',
    '# and the test below does not print the group sizes.',
    `${data} %>%`,
    '  group_by(share_button) %>%',
    '  summarize(',
    '    n = n(),',
    '    mean = mean(like_count),',
    '    sd = sd(like_count)',
    '  )',
    '',
    '# The test. broom::tidy() turns the result into a one-row table: estimate1 and estimate2',
    '# are the group means (no, then yes), statistic is t, parameter is the df (Welch\'s, so it',
    '# can have decimals; it is not the sample size), and p.value is p.',
    `t.test(like_count ~ share_button, data = ${data}) %>%`,
    '  broom::tidy()',
    '',
    "# The effect size: Cohen's d with its 95% confidence interval.",
    `effectsize::cohens_d(like_count ~ share_button, data = ${data})`,
  );
};

const mc427TTestMissing: Template = (p) => {
  const data = d(p, 'steam');
  return lines(
    banner('Welch t-test: playtime_at_review_min by voted_up'),
    '# One or more rows have no playtime_at_review_min. Drop them first, so every line below',
    '# uses the same rows. This line prints nothing.',
    `tested <- ${data} %>%`,
    '  filter(!is.na(playtime_at_review_min))',
    '',
    '# The size, mean, and standard deviation of each group.',
    'tested %>%',
    '  group_by(voted_up) %>%',
    '  summarize(',
    '    n = n(),',
    '    mean = mean(playtime_at_review_min),',
    '    sd = sd(playtime_at_review_min)',
    '  )',
    '',
    '# The test, as a one-row table: estimate1 is the FALSE group, estimate2 the TRUE group.',
    't.test(playtime_at_review_min ~ voted_up, data = tested) %>%',
    '  broom::tidy()',
    '',
    "# The effect size: Cohen's d with its 95% confidence interval.",
    'effectsize::cohens_d(playtime_at_review_min ~ voted_up, data = tested)',
  );
};

const mc427ChiSquare: Template = (p) => {
  const data = d(p, 'df');
  return lines(
    banner('Chi-square test: update by posted_from'),
    '# The observed counts: one row per update, one column per app.',
    `${data} %>%`,
    '  count(update, posted_from) %>%',
    '  pivot_wider(names_from = posted_from, values_from = n, values_fill = 0)',
    '',
    '# The same counts in the form the test reads. Name it counts, so the lines below reuse it.',
    `counts <- xtabs(~ update + posted_from, data = ${data})`,
    '',
    '# The counts the test expected if the two were unrelated. Check that none is below 5.',
    'counts %>%',
    '  chisq.test() %>%',
    '  pluck("expected") %>%',
    '  round(2)',
    '',
    '# The test: X-squared is chi-square, df is its degrees of freedom, and p-value is p.',
    '# This printout keeps two decimals; a tidied table would round 10.03 to 10.0.',
    'counts %>%',
    '  chisq.test()',
    '',
    '# The number of posts in the table, for the write-up.',
    'sum(counts)',
    '',
    "# The effect size: Cramer's V with its 95% confidence interval.",
    'effectsize::cramers_v(counts)',
  );
};

const mc427Anova: Template = (p) => {
  const data = d(p, 'df');
  return lines(
    banner('One-way ANOVA: log_likes by update'),
    '# The size, mean, and standard deviation of each group.',
    `${data} %>%`,
    '  group_by(update) %>%',
    '  summarize(',
    '    n = n(),',
    '    mean = mean(log_likes),',
    '    sd = sd(log_likes)',
    '  )',
    '',
    '# Fit the model and name it fit, so the lines below reuse it. Prints nothing.',
    `fit <- aov(log_likes ~ update, data = ${data})`,
    '',
    '# The test, as a table: the update row holds F (statistic), its df, and p.value;',
    '# the Residuals row holds the second df.',
    'fit %>%',
    '  broom::tidy()',
    '',
    '# The effect size: eta squared, the share of the variation the groups explain.',
    'effectsize::eta_squared(fit)',
    '',
    '# The n: the rows the model used.',
    'fit %>%',
    '  broom::glance() %>%',
    '  select(nobs)',
    '',
    "# Which pairs of groups differ: Tukey's follow-up test, one row per pair.",
    'TukeyHSD(fit) %>%',
    '  broom::tidy()',
  );
};

const mc427Regression: Template = (p) => {
  const data = d(p, 'df');
  return lines(
    banner('Regression: does word_count predict like_count?'),
    '# Fit the line and name it fit, so the lines below reuse it. Prints nothing.',
    `fit <- lm(like_count ~ word_count, data = ${data})`,
    '',
    '# One row per term. The word_count row holds the slope (estimate), its p.value,',
    '# and its 95% interval (conf.low, conf.high).',
    'fit %>%',
    '  broom::tidy(conf.int = TRUE)',
    '',
    '# The whole model in one row: r.squared, F (statistic), its two df, p.value, and nobs,',
    '# the number of rows used.',
    'fit %>%',
    '  broom::glance() %>%',
    '  select(r.squared, statistic, df, df.residual, p.value, nobs)',
  );
};

const mc427Correlation: Template = (p) => {
  const data = d(p, 'df');
  return lines(
    banner('Correlation: word_count and like_count'),
    "# Pearson's r as a one-row table: estimate is r, statistic is t, parameter is the df,",
    '# and conf.low and conf.high are its 95% interval.',
    `cor.test(~ word_count + like_count, data = ${data}) %>%`,
    '  broom::tidy()',
  );
};

// ---------------- v2v shared: the settings block ----------------

const v2vSettingsBlock: Template = () =>
  lines(
    banner('Settings block: load the data and name the variables the tests use'),
    '# To run this script on other data, change only this block.',
    'library(tidyverse)',
    'library(v2v)',
    '',
    '# Load the analysis file, then keep the columns the tests use under the names they use.',
    '# outcome is a number; group2 has two groups; group3 has three or more; predictor is a',
    '# number; cat_a and cat_b are categories. factor() makes a column a category.',
    'analysis <- read_rds("data/twitch_analysis.RDS") %>%',
    '  transmute(',
    '    outcome = message_length,',
    '    group2 = factor(channel_type),',
    '    group3 = factor(viewer_band),',
    '    predictor = hour(ts),',
    '    cat_a = factor(viewer_band),',
    '    cat_b = factor(channel_type)',
    '  )',
    '',
    '# Check the names and types.',
    'glimpse(analysis)',
  );

// ---------------- MC 451 (v2v wrappers, rubric form) ----------------

// Owner q-20261018-0044 = A: MC 451 and MC 501 write the plain calls by default (auraR.plainCalls),
// with the v2v wrapper last as a check that prints the same numbers. The wrapper forms below stay
// for auraR.plainCalls = false, as the rubrics read before the change.
const plainTTestBody = (): string[] => [
  '# The Welch t-test as a one-row table: estimate1 and estimate2 are the group means,',
  '# statistic is t, parameter is the df, and p.value is p.',
  't.test(outcome ~ group2, data = analysis) %>%',
  '  broom::tidy()',
  '',
  "# Cohen's d with its 95% interval.",
  'effectsize::cohens_d(outcome ~ group2, data = analysis)',
  '',
  "# Check: the v2v wrapper prints the same t, df, p, and Cohen's d.",
  'run_t_test(analysis, value = outcome, group = group2)',
];

const plainChiSquareTail = (withInterval: boolean): string[] => [
  '# The test as a one-row table: statistic is chi-square, parameter is the df, p.value is p.',
  'counts %>%',
  '  chisq.test() %>%',
  '  broom::tidy()',
  '',
  withInterval
    ? "# Cramer's V with its 95% interval. adjust = FALSE gives the V that run_chi_square() prints."
    : "# Cramer's V. adjust = FALSE gives the V that run_chi_square() prints.",
  'effectsize::cramers_v(counts, adjust = FALSE)',
  '',
  '# The N: the rows the table counts.',
  'counts %>%',
  '  sum()',
];

const plainChiSquareCheck = (): string[] => [
  '',
  "# Check: the v2v wrapper prints the same N, chi-square, df, p, and Cramer's V.",
  'run_chi_square(analysis, x = cat_a, y = cat_b)',
];

const plainChiSquareHead = (): string[] => [
  banner('Chi-square test of independence: cat_a by cat_b'),
  '# The counts in the form the test reads. Name it counts, so the lines below reuse it.',
  'counts <- xtabs(~ cat_a + cat_b, data = analysis)',
  '',
  '# The counts the test expected if the two were unrelated. Check that none is below 5.',
  'counts %>%',
  '  chisq.test() %>%',
  '  pluck("expected") %>%',
  '  round(2)',
  '',
];

const plainTTest: Template = () =>
  lines(
    banner('Welch t-test: outcome by group2'),
    '# The size, mean, and standard deviation of each group. The APA report needs the n,',
    '# and the test does not print it.',
    'analysis %>%',
    '  filter(!is.na(outcome), !is.na(group2)) %>%',
    '  group_by(group2) %>%',
    '  summarize(',
    '    n = n(),',
    '    mean = mean(outcome),',
    '    sd = sd(outcome)',
    '  )',
    '',
    ...plainTTestBody(),
  );

const mc451ChiSquare: Template = (_p, opts) =>
  opts.plainCalls
    ? lines(...plainChiSquareHead(), ...plainChiSquareTail(false), ...plainChiSquareCheck())
    : lines(
    banner('Chi-square test of independence: cat_a by cat_b'),
    '# The counts the test expected if the two were unrelated. Check that none is below 5.',
    'xtabs(~ cat_a + cat_b, data = analysis) %>%',
    '  chisq.test() %>%',
    '  pluck("expected") %>%',
    '  round(2)',
    '',
    "# The test with its effect size. Prints N, chi-square, df, p, and Cramer's V.",
    'run_chi_square(analysis, x = cat_a, y = cat_b)',
  );

const mc451TTest: Template = (p, opts) =>
  opts.plainCalls
    ? plainTTest(p, opts)
    : lines(
    banner('Welch t-test: outcome by group2'),
    '# The size, mean, and standard deviation of each group. The APA report needs the n,',
    '# and run_t_test() does not print it.',
    'analysis %>%',
    '  filter(!is.na(outcome), !is.na(group2)) %>%',
    '  group_by(group2) %>%',
    '  summarize(',
    '    n = n(),',
    '    mean = mean(outcome),',
    '    sd = sd(outcome)',
    '  )',
    '',
    "# The test with its effect size. Prints the two means, t, df, p, and Cohen's d.",
    'run_t_test(analysis, value = outcome, group = group2)',
  );

const mc451Anova: Template = () =>
  lines(
    banner('One-way ANOVA: outcome by group3'),
    '# The size, mean, and standard deviation of each group.',
    'analysis %>%',
    '  filter(!is.na(outcome), !is.na(group3)) %>%',
    '  group_by(group3) %>%',
    '  summarize(',
    '    n = n(),',
    '    mean = mean(outcome),',
    '    sd = sd(outcome)',
    '  )',
    '',
    '# Fit the model and name it fit, so the lines below reuse it. Prints nothing.',
    'fit <- aov(outcome ~ group3, data = analysis)',
    '',
    '# The ANOVA table: F value, its two df (group3 and Residuals), and Pr(>F), the p-value.',
    'summary(fit)',
    '',
    "# Eta squared from the sums of squares: the group3 row's sumsq divided by the total.",
    'fit %>%',
    '  broom::tidy() %>%',
    '  mutate(eta_sq = sumsq / sum(sumsq))',
    '',
    '# The n: the rows the model used.',
    'fit %>%',
    '  broom::glance() %>%',
    '  select(nobs)',
  );

const mc451Regression: Template = () =>
  lines(
    banner('Linear regression: outcome predicted by predictor'),
    '# Fit the line and name it fit, so the lines below reuse it. Prints nothing.',
    'fit <- lm(outcome ~ predictor, data = analysis)',
    '',
    '# The coefficients (the predictor row\'s Estimate is the slope, in outcome units per unit of',
    '# predictor), R-squared, and the F-statistic with its two df and p-value.',
    'summary(fit)',
    '',
    '# The n: the rows the model used.',
    'fit %>%',
    '  broom::glance() %>%',
    '  select(r.squared, nobs)',
  );

const correlationPredictorOutcome: Template = () =>
  lines(
    banner('Correlation: predictor and outcome'),
    "# Pearson's r as a one-row table: estimate is r, statistic is t, parameter is the df,",
    '# and conf.low and conf.high are its 95% interval.',
    'cor.test(~ predictor + outcome, data = analysis) %>%',
    '  broom::tidy()',
  );

// ---------------- MC 501 (adds intervals, Welch ANOVA, Tukey, lm.beta) ----------------

const mc501ChiSquare: Template = (_p, opts) =>
  opts.plainCalls
    ? lines(
        ...plainChiSquareHead(),
        ...plainChiSquareTail(true),
        '',
        '# Standardized residuals: cells beyond 2 or -2 are the ones driving the result.',
        'counts %>%',
        '  chisq.test() %>%',
        '  pluck("stdres") %>%',
        '  round(2)',
        ...plainChiSquareCheck(),
      )
    : lines(
    banner('Chi-square test of independence: cat_a by cat_b'),
    '# The counts in the form the test reads. Name it counts, so the lines below reuse it.',
    'counts <- xtabs(~ cat_a + cat_b, data = analysis)',
    '',
    '# The counts the test expected if the two were unrelated. Check that none is below 5.',
    'counts %>%',
    '  chisq.test() %>%',
    '  pluck("expected") %>%',
    '  round(2)',
    '',
    "# The test with its effect size. Prints N, chi-square, df, p, and Cramer's V.",
    'run_chi_square(analysis, x = cat_a, y = cat_b)',
    '',
    "# Cramer's V with its 95% interval. adjust = FALSE gives the same V that run_chi_square() prints.",
    'effectsize::cramers_v(counts, adjust = FALSE)',
    '',
    '# Standardized residuals: cells beyond 2 or -2 are the ones driving the result.',
    'counts %>%',
    '  chisq.test() %>%',
    '  pluck("stdres") %>%',
    '  round(2)',
  );

const mc501TTest: Template = (p, opts) =>
  opts.plainCalls
    ? plainTTest(p, opts)
    : lines(
    banner('Welch t-test: outcome by group2'),
    '# The size, mean, and standard deviation of each group. The APA report needs the n,',
    '# and run_t_test() does not print it.',
    'analysis %>%',
    '  filter(!is.na(outcome), !is.na(group2)) %>%',
    '  group_by(group2) %>%',
    '  summarize(',
    '    n = n(),',
    '    mean = mean(outcome),',
    '    sd = sd(outcome)',
    '  )',
    '',
    "# The test with its effect size. Prints the two means, t, df, p, and Cohen's d.",
    'run_t_test(analysis, value = outcome, group = group2)',
    '',
    "# Cohen's d with its 95% interval.",
    'effectsize::cohens_d(outcome ~ group2, data = analysis)',
  );

const mc501Anova: Template = () =>
  lines(
    banner('One-way ANOVA: outcome by group3'),
    '# The size, mean, and standard deviation of each group.',
    'analysis %>%',
    '  filter(!is.na(outcome), !is.na(group3)) %>%',
    '  group_by(group3) %>%',
    '  summarize(',
    '    n = n(),',
    '    mean = mean(outcome),',
    '    sd = sd(outcome)',
    '  )',
    '',
    '# Fit the model and name it fit, so the lines below reuse it. Prints nothing.',
    'fit <- aov(outcome ~ group3, data = analysis)',
    '',
    '# The ANOVA table: F value, its two df (group3 and Residuals), and Pr(>F), the p-value.',
    'summary(fit)',
    '',
    "# Welch's ANOVA, which does not assume the groups spread out equally.",
    'oneway.test(outcome ~ group3, data = analysis)',
    '',
    '# Eta squared and omega squared, each with its 95% interval.',
    'effectsize::eta_squared(fit)',
    'effectsize::omega_squared(fit)',
    '',
    '# The n: the rows the model used.',
    'fit %>%',
    '  broom::glance() %>%',
    '  select(nobs)',
    '',
    "# Which pairs of groups differ: Tukey's follow-up test, one row per pair.",
    'TukeyHSD(fit) %>%',
    '  broom::tidy()',
  );

const mc501Regression: Template = () =>
  lines(
    banner('Linear regression: outcome predicted by predictor'),
    '# Fit the line and name it fit, so the lines below reuse it. Prints nothing.',
    'fit <- lm(outcome ~ predictor, data = analysis)',
    '',
    '# The coefficients (the predictor row\'s Estimate is the slope, in outcome units per unit of',
    '# predictor), R-squared, and the F-statistic with its two df and p-value.',
    'summary(fit)',
    '',
    '# The standardized slope: the change in outcome, in standard deviations, per standard',
    '# deviation of predictor.',
    'lm.beta::lm.beta(fit)',
    '',
    '# The n: the rows the model used.',
    'fit %>%',
    '  broom::glance() %>%',
    '  select(r.squared, nobs)',
  );

// Power analysis (MC 501 only): the sample size the design needs, from w05 and the rubric's
// "power statistics behind the design" row. A plain pwr.t.test() call, one comment per argument.
const mc501Power: Template = () =>
  lines(
    banner('Power analysis: the sample size your design needs'),
    '# How many messages per group would it take to detect your effect? pwr.t.test() answers that for',
    '# a two-group t-test. Give it three of the four quantities and it solves for the one you leave',
    '# out; n is left out here, so it returns the sample size needed in each group.',
    'library(pwr)',
    '',
    'pwr.t.test(',
    "  d = 0.5,              # the effect size you want to be able to detect (0.5 is a medium Cohen's d)",
    '  sig.level = 0.05,     # alpha: the false-positive rate you will accept',
    '  power = 0.80,         # the chance of finding the effect if it is real (the 80% convention)',
    '  type = "two.sample"   # two independent groups, the same shape as your Welch t-test',
    ')',
  );

// ---------------- v2v-plain (proposed stepping-stone variants) ----------------

const v2vPlainTTest: Template = () =>
  lines(
    banner('Welch t-test: outcome by group2, with the functions run_t_test() wraps'),
    '# PROPOSED for the stepping-stone audit; not a course dialect.',
    '# The test as a one-row table: estimate1 and estimate2 are the group means, statistic is t,',
    '# parameter is the df, and p.value is p.',
    't.test(outcome ~ group2, data = analysis) %>%',
    '  broom::tidy()',
    '',
    "# Cohen's d with its 95% interval (pooled SD, the same d run_t_test() prints).",
    'effectsize::cohens_d(outcome ~ group2, data = analysis)',
  );

const v2vPlainChiSquare: Template = () =>
  lines(
    banner('Chi-square test: cat_a by cat_b, with the functions run_chi_square() wraps'),
    '# PROPOSED for the stepping-stone audit; not a course dialect.',
    'counts <- xtabs(~ cat_a + cat_b, data = analysis)',
    '',
    '# The test, as a one-row table: statistic is chi-square, parameter is the df, p.value is p.',
    'counts %>%',
    '  chisq.test() %>%',
    '  broom::tidy()',
    '',
    "# Cramer's V without the small-sample adjustment, the number run_chi_square() prints.",
    'effectsize::cramers_v(counts, adjust = FALSE)',
  );

export const MC427_R4: Record<string, Template> = {
  't-test': mc427TTest,
  't-test-missing': mc427TTestMissing,
  'chi-square': mc427ChiSquare,
  anova: mc427Anova,
  regression: mc427Regression,
  correlation: mc427Correlation,
};

export const V2V_R4: Record<string, Template> = {
  'settings-block': v2vSettingsBlock,
};

export const MC451_R4: Record<string, Template> = {
  'chi-square': mc451ChiSquare,
  't-test': mc451TTest,
  anova: mc451Anova,
  regression: mc451Regression,
  correlation: correlationPredictorOutcome,
};

export const MC501_R4: Record<string, Template> = {
  'chi-square': mc501ChiSquare,
  't-test': mc501TTest,
  anova: mc501Anova,
  regression: mc501Regression,
  correlation: correlationPredictorOutcome,
  power: mc501Power,
};

export const V2V_PLAIN_R4: Record<string, Template> = {
  't-test': v2vPlainTTest,
  'chi-square': v2vPlainChiSquare,
};
