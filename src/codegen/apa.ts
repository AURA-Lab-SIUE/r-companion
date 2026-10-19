// R4 "APA numbers to check your sentence": code templates (#rgui, 0.4.0).
//
// Owner decision U4 (coordinator default, reversible through auraR.apaCheck): the APA template is
// allowed as a check on the numbers, and no plain-English sentence is generated in any profile,
// because the interpretation is graded. So each block prints the test's numbers in APA form from
// the student's own data and stops there: no words of the sentence, no interpretation.
//
// The numbers follow the formats in workstream B's filled sentences
// (O:\20-research\aura-lab\r-companion-golden\sentences\): two decimals, three for p and for eta
// squared, no leading zero for a value that cannot pass 1, df without a thousands comma (APA 7
// section 6.38), and N with one. MC 427 rounds the Welch df to a whole number, as its A02 format
// example does; MC 451 and MC 501 keep one decimal, as run_t_test() prints it.

import { lines, banner } from './house';
import { GenParams, Template } from './types';

/** The tests an APA block exists for, in menu order. */
export const APA_TESTS = ['t-test', 'chi-square', 'anova', 'regression', 'correlation'] as const;
export type ApaTest = (typeof APA_TESTS)[number];

/** The task id of each test's APA block. */
export const apaTask = (t: ApaTest) => `apa-${t}`;

interface Vars {
  data: string;
  outcome: string;
  group2: string;
  group3: string;
  catA: string;
  catB: string;
  predictor: string;
  /** Decimals on the Welch df. */
  tDf: number;
  /** What must run first, for the comment. */
  needs: string;
}

const MC427: Vars = {
  data: 'df',
  outcome: 'like_count',
  group2: 'share_button',
  group3: 'update',
  catA: 'update',
  catB: 'posted_from',
  predictor: 'word_count',
  tDf: 0,
  needs: 'the Import block above',
};

const V2V: Vars = {
  data: 'analysis',
  outcome: 'outcome',
  group2: 'group2',
  group3: 'group3',
  catA: 'cat_a',
  catB: 'cat_b',
  predictor: 'predictor',
  tDf: 1,
  needs: 'the settings block above',
};

// The three helpers every APA block defines, so each block runs on its own
const helpers = (needs: string) => [
  '# Your sentence is yours to write. This prints the test\'s numbers in APA form from your',
  `# data, so you can check the ones you typed. Run ${needs} first.`,
  '# Three helpers for APA style: two decimals by default, no leading zero for a value that',
  '# cannot pass 1 (p, r, V, eta squared), and p written as "= .043" or "< .001".',
  'apa_num <- function(x, digits = 2) scales::number(x, accuracy = 10^-digits, big.mark = "")',
  'apa_bounded <- function(x, digits = 2) str_replace(apa_num(x, digits), "^(-?)0[.]", "\\\\1.")',
  'apa_p <- function(p, digits = 3) if_else(p < .001, "< .001", str_c("= ", apa_bounded(p, digits)))',
  '',
];

function tTest(v: Vars, p: GenParams): string {
  const data = p.data ?? v.data;
  const outcome = p.column ?? v.outcome;
  return lines(
    banner(`APA numbers to check your sentence: Welch t-test, ${outcome} by ${v.group2}`),
    ...helpers(v.needs),
    "# The test and Cohen's d side by side in one row, then the APA numbers from that row.",
    `t.test(${outcome} ~ ${v.group2}, data = ${data}) %>%`,
    '  broom::tidy() %>%',
    `  bind_cols(effectsize::cohens_d(${outcome} ~ ${v.group2}, data = ${data})) %>%`,
    '  mutate(apa = str_glue(',
    `    "t({apa_num(parameter, ${v.tDf})}) = {apa_num(statistic)}, p {apa_p(p.value)}, ",`,
    '    "d = {apa_num(Cohens_d)}, 95% CI [{apa_num(CI_low)}, {apa_num(CI_high)}]"',
    '  )) %>%',
    '  pull(apa)',
  );
}

function chiSquare(v: Vars, p: GenParams): string {
  const data = p.data ?? v.data;
  return lines(
    banner(`APA numbers to check your sentence: chi-square, ${v.catA} by ${v.catB}`),
    ...helpers(v.needs),
    "# The counts, then the test and Cramer's V in one row, then the APA numbers from that row.",
    '# In your sentence, chi-square is written with the Greek letter chi and a superscript 2.',
    `apa_counts <- xtabs(~ ${v.catA} + ${v.catB}, data = ${data})`,
    'apa_counts %>%',
    '  chisq.test() %>%',
    '  broom::tidy() %>%',
    '  bind_cols(effectsize::cramers_v(apa_counts)) %>%',
    '  rename(V = starts_with("Cramers_v")) %>%',
    '  mutate(apa = str_glue(',
    '    "chi-square({parameter}, N = {scales::comma(sum(apa_counts))}) = {apa_num(statistic)}, ",',
    '    "p {apa_p(p.value)}, V = {apa_bounded(V)}, 95% CI [{apa_bounded(CI_low)}, {apa_bounded(CI_high)}]"',
    '  )) %>%',
    '  pull(apa)',
  );
}

function anova(v: Vars, p: GenParams): string {
  const data = p.data ?? v.data;
  const outcome = v === MC427 ? 'log_likes' : v.outcome;
  return lines(
    banner(`APA numbers to check your sentence: one-way ANOVA, ${outcome} by ${v.group3}`),
    ...helpers(v.needs),
    '# Fit the model and name it apa_fit. Prints nothing.',
    `apa_fit <- aov(${outcome} ~ ${v.group3}, data = ${data})`,
    '',
    '# The group row of the ANOVA table, with the Residuals df beside it and eta squared, then',
    '# the APA numbers from that row.',
    'apa_fit %>%',
    '  broom::tidy() %>%',
    '  mutate(df_resid = last(df)) %>%',
    '  slice(1) %>%',
    '  bind_cols(effectsize::eta_squared(apa_fit)) %>%',
    '  rename(eta = starts_with("Eta2")) %>%',
    '  mutate(apa = str_glue(',
    '    "F({df}, {df_resid}) = {apa_num(statistic)}, p {apa_p(p.value)}, ",',
    '    "eta squared = {apa_bounded(eta, 3)}, 95% CI [{apa_bounded(CI_low)}, {apa_bounded(CI_high)}], ",',
    '    "N = {scales::comma(nobs(apa_fit))}"',
    '  )) %>%',
    '  pull(apa)',
  );
}

function regression(v: Vars, p: GenParams): string {
  const data = p.data ?? v.data;
  return lines(
    banner(`APA numbers to check your sentence: regression, ${v.outcome} on ${v.predictor}`),
    ...helpers(v.needs),
    '# Fit the line and name it apa_fit. Prints nothing.',
    `apa_fit <- lm(${v.outcome} ~ ${v.predictor}, data = ${data})`,
    '',
    "# The predictor's row (the slope) with the model's R-squared and F beside it, then the",
    '# APA numbers from that row.',
    'apa_fit %>%',
    '  broom::tidy() %>%',
    `  filter(term == "${v.predictor}") %>%`,
    '  bind_cols(',
    '    broom::glance(apa_fit) %>%',
    '      select(r.squared, f = statistic, f_p = p.value, df1 = df, df2 = df.residual, nobs)',
    '  ) %>%',
    '  mutate(apa = str_glue(',
    '    "b = {apa_num(estimate, 3)}, SE = {apa_num(std.error, 3)}, t({df2}) = {apa_num(statistic)}, ",',
    '    "p {apa_p(p.value)}; R-squared {apa_p(r.squared)}, F({df1}, {df2}) = {apa_num(f)}, ",',
    '    "p {apa_p(f_p)}, N = {scales::comma(nobs)}"',
    '  )) %>%',
    '  pull(apa)',
  );
}

function correlation(v: Vars, p: GenParams): string {
  const data = p.data ?? v.data;
  return lines(
    banner(`APA numbers to check your sentence: correlation, ${v.predictor} and ${v.outcome}`),
    ...helpers(v.needs),
    "# Pearson's r as a one-row table, then the APA numbers from that row.",
    `cor.test(~ ${v.predictor} + ${v.outcome}, data = ${data}) %>%`,
    '  broom::tidy() %>%',
    '  mutate(apa = str_glue(',
    '    "r({parameter}) = {apa_bounded(estimate)}, p {apa_p(p.value)}, ",',
    '    "95% CI [{apa_bounded(conf.low)}, {apa_bounded(conf.high)}]"',
    '  )) %>%',
    '  pull(apa)',
  );
}

function templates(v: Vars): Record<string, Template> {
  return {
    'apa-t-test': (p) => tTest(v, p),
    'apa-chi-square': (p) => chiSquare(v, p),
    'apa-anova': (p) => anova(v, p),
    'apa-regression': (p) => regression(v, p),
    'apa-correlation': (p) => correlation(v, p),
  };
}

export const MC427_APA = templates(MC427);
export const V2V_APA = templates(V2V);
