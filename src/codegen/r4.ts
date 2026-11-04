// R4 Test: code templates (workstream E, #rgui).
// MC 427 uses plain tidyverse + broom + effectsize; MC 451/MC 501 write plain base R and
// effectsize in the form their Inferencing worksheets use (owner 2026-11-04: never a v2v
// wrapper). Reproduces the golden fixtures byte for byte.

import { lines, banner } from './house';
import { GenParams, Template } from './types';
import { chosenAnova, chosenChiSquare, chosenCorrelation, chosenRegression, chosenTTest } from './chosen';

const d = (p: GenParams, def: string) => p.data ?? def;

// ---------------- MC 427 (plain tidyverse) ----------------

const mc427TTest: Template = (p) => {
  const data = d(p, 'df');
  if (p.columns && p.columns.length === 2) return chosenTTest(data, p.columns[0], p.columns[1]);
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
  if (p.columns && p.columns.length === 2) return chosenTTest(data, p.columns[0], p.columns[1]);
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
  if (p.columns && p.columns.length === 2) return chosenChiSquare(data, p.columns[0], p.columns[1]);
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
  if (p.columns && p.columns.length === 2) return chosenAnova(data, p.columns[0], p.columns[1]);
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
  if (p.columns && p.columns.length === 2) return chosenRegression(data, p.columns[0], p.columns[1]);
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
  if (p.columns && p.columns.length === 2) return chosenCorrelation(data, p.columns[0], p.columns[1]);
  return lines(
    banner('Correlation: word_count and like_count'),
    "# Pearson's r as a one-row table: estimate is r, statistic is t, parameter is the df,",
    '# and conf.low and conf.high are its 95% interval.',
    `cor.test(~ word_count + like_count, data = ${data}) %>%`,
    '  broom::tidy()',
  );
};

// ---------------- v2v shared: the settings block ----------------

// The six names the tests use, in order (code parity, 2026-10-28: the student may pick their own
// column for each; factor() makes the four category roles categories).
export const SETTINGS_ROLES = ['outcome', 'group2', 'group3', 'predictor', 'cat_a', 'cat_b'] as const;
const COURSE_SETTINGS = ['message_length', 'factor(channel_type)', 'factor(viewer_band)', 'hour(ts)', 'factor(viewer_band)', 'factor(channel_type)'];

const v2vSettingsBlock: Template = (p) => {
  const bt = (n: string) => (/^[A-Za-z.][A-Za-z0-9._]*$/.test(n) ? n : '`' + n + '`');
  const chosen = p.columns && p.columns.length === SETTINGS_ROLES.length ? p.columns : undefined;
  const exprs = chosen
    ? chosen.map((c, i) => (i === 0 || i === 3 ? bt(c) : `factor(${bt(c)})`))
    : COURSE_SETTINGS;
  return lines(
    banner('Settings block: load the data and name the variables the tests use'),
    '# To run this script on other data, change only this block. effectsize adds the effect',
    "# sizes (Cohen's d, Cramer's V, eta squared) the tests below report.",
    'library(tidyverse)',
    'library(effectsize)',
    '',
    '# Load the analysis file, then keep the columns the tests use under the names they use.',
    '# outcome is a number; group2 has two groups; group3 has three or more; predictor is a',
    '# number; cat_a and cat_b are categories. factor() makes a column a category.',
    `analysis <- read_rds(${JSON.stringify(p.file ?? 'data/twitch_analysis.RDS')}) %>%`,
    '  transmute(',
    ...SETTINGS_ROLES.map((r, i) => `    ${r} = ${exprs[i]}${i < SETTINGS_ROLES.length - 1 ? ',' : ''}`),
    '  )',
    '',
    '# Check the names and types.',
    'glimpse(analysis)',
  );
};

// ---------------- MC 451 and MC 501 (real base R and effectsize, 0.7.0) ----------------

// Owner 2026-11-04: students see the real functions they will use after the course (t.test,
// chisq.test, aov, lm, and effectsize), never a v2v wrapper. The Companion writes the whole
// block, commented, and the student runs it and reads the output, which keeps the task inside
// the novice ceiling (q-20261103-0005). MC 501 adds the diagnostics its rubric asks for. The
// blocks match the Inferencing worksheets (starters 13) line for line. This supersedes 0.6.3's
// one-line run_*() calls, q-20261018-0044, and q-20261022-0006.
const v2vTTest = (grad: boolean): string =>
  lines(
    banner('Welch t-test: outcome by group2'),
    '# The size, mean, and standard deviation of each group. The write-up needs all three, and',
    '# the test below does not print the group sizes. Rows missing either column are dropped',
    '# first, so n matches the rows the test uses.',
    'analysis %>%',
    '  filter(!is.na(outcome), !is.na(group2)) %>%',
    '  group_by(group2) %>%',
    '  summarize(n = n(), mean = mean(outcome), sd = sd(outcome))',
    '',
    "# The test. t is the test statistic, df is Welch's degrees of freedom (it can have decimals),",
    '# and p-value is p. The two means print at the bottom, in the order the table above lists',
    '# the groups.',
    't.test(outcome ~ group2, data = analysis)',
    '',
    "# The effect size: Cohen's d with its 95% confidence interval. Below 0.2 is negligible, 0.2",
    '# small, 0.5 medium, and 0.8 or more large.',
    'cohens_d(outcome ~ group2, data = analysis)',
    ...(grad
      ? [
          '',
          "# The 95% confidence interval for the gap between the two means is the line that starts",
          '# with 95 percent confidence interval in the t.test() output above.',
        ]
      : []),
  );

const v2vChiSquare = (grad: boolean): string =>
  lines(
    banner('Chi-square test of independence: cat_a by cat_b'),
    '# The observed counts in the form the test reads: one row per value of cat_a, one column',
    '# per value of cat_b. Name it counts, so the lines below reuse it.',
    'counts <- xtabs(~ cat_a + cat_b, data = analysis)',
    '',
    '# N, the number of messages the test used.',
    'sum(counts)',
    '',
    '# The test, named chi so the lines below reuse it. X-squared is chi-square, df is its degrees',
    '# of freedom, and p-value is p.',
    'chi <- chisq.test(counts)',
    'chi',
    '',
    "# The effect size: Cramer's V with its 95% confidence interval. Below 0.1 is negligible, 0.1",
    '# small, 0.3 medium, and 0.5 or more large.',
    'cramers_v(counts, adjust = FALSE)',
    ...(grad
      ? [
          '',
          '# The counts the test expected if the two were unrelated. Each should be at least 5;',
          '# a smaller one makes the test unreliable.',
          'round(chi$expected, 1)',
          '',
          '# The standardized residuals: a cell beyond 2 or -2 is what drives the result.',
          'round(chi$stdres, 2)',
        ]
      : []),
  );

const v2vAnova = (grad: boolean): string =>
  lines(
    banner('One-way ANOVA: outcome by group3'),
    '# The size, mean, and standard deviation of each group. Rows missing either column are',
    '# dropped first, so n matches the rows the test uses.',
    'analysis %>%',
    '  filter(!is.na(outcome), !is.na(group3)) %>%',
    '  group_by(group3) %>%',
    '  summarize(n = n(), mean = mean(outcome), sd = sd(outcome))',
    '',
    '# Fit the model and name it fit_anova, so the lines below reuse it. Prints nothing.',
    'fit_anova <- aov(outcome ~ group3, data = analysis)',
    '',
    '# The test as a table: the group3 row holds F (F value), its df, and p (Pr(>F)); the',
    '# Residuals row holds the second df.',
    'summary(fit_anova)',
    '',
    '# The effect size: eta squared, the share of the variation the groups explain. Below 0.01',
    '# is negligible, 0.01 small, 0.06 medium, and 0.14 or more large.',
    'eta_squared(fit_anova)',
    ...(grad
      ? [
          '',
          "# Welch's ANOVA, which does not assume the groups have the same spread.",
          'oneway.test(outcome ~ group3, data = analysis)',
          '',
          '# Omega squared, a less biased estimate of the same share.',
          'omega_squared(fit_anova)',
          '',
          "# Which pairs of groups differ: Tukey's follow-up test, one row per pair, with an",
          '# adjusted p (p adj) for each.',
          'TukeyHSD(fit_anova)',
        ]
      : []),
  );

const v2vRegression = (grad: boolean): string =>
  lines(
    banner('Linear regression: outcome predicted by predictor'),
    '# Fit the line and name it fit_lm, so the lines below reuse it. lm() leaves out a row',
    '# missing either column by itself. Prints nothing.',
    'fit_lm <- lm(outcome ~ predictor, data = analysis)',
    '',
    '# Everything the write-up needs: in the Coefficients table, the predictor row holds the',
    '# slope (Estimate) and its p (Pr(>|t|)); below it, Multiple R-squared is the share of the',
    '# variation explained, and the last line holds F, its two df, and p.',
    'summary(fit_lm)',
    ...(grad
      ? [
          '',
          '# The standardized slope (beta), so slopes measured in different units compare.',
          'standardize_parameters(fit_lm)',
          '',
          '# Two checks on the fit. The first plot should show no pattern (the residuals spread',
          '# evenly around zero); the second should run close to its line (normal residuals).',
          'plot(fit_lm, which = 1)',
          'plot(fit_lm, which = 2)',
        ]
      : []),
  );

const correlationPredictorOutcome: Template = () =>
  lines(
    banner('Correlation: predictor and outcome'),
    "# Pearson's r (cor at the bottom), with t, the df, p, and the 95 percent confidence interval.",
    'cor.test(~ predictor + outcome, data = analysis)',
  );

const mc451ChiSquare: Template = () => v2vChiSquare(false);
const mc451TTest: Template = () => v2vTTest(false);
const mc451Anova: Template = () => v2vAnova(false);
const mc451Regression: Template = () => v2vRegression(false);

// ---------------- MC 501 (the same tests, plus the diagnostics its rubric asks for) ----------------

const mc501ChiSquare: Template = () => v2vChiSquare(true);
const mc501TTest: Template = () => v2vTTest(true);
const mc501Anova: Template = () => v2vAnova(true);
const mc501Regression: Template = () => v2vRegression(true);

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
