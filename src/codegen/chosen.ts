// Describe tasks on the columns a student picks (code parity, 2026-10-28; owner q-20261028-0011 = A):
// the bar chart, histogram, boxplot, line chart, and summary by group, for any table. The chart's
// title and axis labels are YOUR TURN lines the student fills in, the same way the alt text is.
// MC 451 and MC 501 add the course theme and save to figures/; MC 427 is plain ggplot2 and saves
// to the course folder.

import { lines, banner } from './house';

const ALT = '    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."';

/** A column name as R reads it: bare when it is a plain name, else in backticks. */
export function rName(n: string): string {
  return /^[A-Za-z.][A-Za-z0-9._]*$/.test(n) && !/^\.\d/.test(n) ? n : '`' + n.replace(/`/g, '\\`') + '`';
}

/** A file-name-safe version of a column name: message_length stays, "Likes (all)" becomes likes-all. */
function slug(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'column';
}

function save(v2v: boolean, name: string): string[] {
  return v2v
    ? ['', '# Save the chart to a picture file in your figures folder.', 'dir.create("figures", showWarnings = FALSE)', `ggsave("figures/${name}.png", width = 7, height = 5)`]
    : ['', '# Save the chart to a picture file in your course folder.', `ggsave("${name}.png", width = 7, height = 5)`];
}

function labsLines(v2v: boolean, extra: string[] = []): string[] {
  return [
    '  labs(',
    '    title = "YOUR TURN: a title that says what the chart shows",',
    '    x = "YOUR TURN: what the x axis measures",',
    '    y = "YOUR TURN: what the y axis measures",',
    ...extra,
    ALT,
    v2v ? '  ) +' : '  )',
    ...(v2v ? ['  v2v::theme_v2v()'] : []),
  ];
}

export function chosenBar(v2v: boolean, data: string, column: string): string {
  const c = rName(column);
  return lines(
    banner(`Bar chart: one bar per value of ${column}`),
    `# Count the rows for each value of ${column}, keep the 15 biggest (a tie can keep a few more),`,
    '# then draw one bar per value, longest at the top. Rows with no value are dropped first.',
    '# as.character() lets a TRUE/FALSE or number column work too. Inside ggplot() the pieces join',
    '# with +, not the pipe.',
    `${data} %>%`,
    `  filter(!is.na(${c})) %>%`,
    `  count(${c}) %>%`,
    '  slice_max(n, n = 15) %>%',
    `  ggplot(aes(x = fct_reorder(as.character(${c}), n), y = n)) +`,
    '  geom_col() +',
    '  coord_flip() +',
    ...(v2v ? ['  # Write the counts with commas (12,000), not 12000.', '  scale_y_continuous(labels = scales::label_comma()) +'] : []),
    ...labsLines(v2v),
    ...save(v2v, `${slug(column)}-bar`),
  );
}

export function chosenHistogram(v2v: boolean, data: string, column: string): string {
  const c = rName(column);
  return lines(
    banner(`Histogram: how ${column} is spread out`),
    `# Each bar counts the rows whose ${column} falls in its band. bins = 30 draws 30 bars; change`,
    '# it to see more or fewer. Rows with no value are dropped first.',
    `${data} %>%`,
    `  filter(!is.na(${c})) %>%`,
    `  ggplot(aes(x = ${c})) +`,
    '  geom_histogram(bins = 30) +',
    ...(v2v ? ['  # Write the counts with commas (12,000), not 12000.', '  scale_y_continuous(labels = scales::label_comma()) +'] : []),
    ...labsLines(v2v),
    ...save(v2v, `${slug(column)}-histogram`),
  );
}

export function chosenBoxplot(v2v: boolean, data: string, value: string, group: string): string {
  const y = rName(value);
  const x = rName(group);
  return lines(
    banner(`Boxplot: ${value}, compared across ${group}`),
    `# One box per value of ${group}. The line in each box is the median; the box holds the middle`,
    `# half of the rows. Rows missing either column are dropped first. factor() makes one box per`,
    `# value even when ${group} is a number or TRUE/FALSE.`,
    `${data} %>%`,
    `  filter(!is.na(${x}), !is.na(${y})) %>%`,
    `  ggplot(aes(x = factor(${x}), y = ${y})) +`,
    '  geom_boxplot() +',
    ...labsLines(v2v),
    ...save(v2v, `${slug(value)}-by-${slug(group)}-boxplot`),
  );
}

export function chosenGroupedSummary(data: string, group: string, value: string): string {
  const g = rName(group);
  const v = rName(value);
  return lines(
    banner(`Summary by group: ${value} for each value of ${group}`),
    `# For each value of ${group}: how many rows, and the mean, median, and standard deviation of`,
    `# ${value}. Rows with no ${group} are dropped first; na.rm = TRUE skips a missing ${value}.`,
    `${data} %>%`,
    `  filter(!is.na(${g})) %>%`,
    `  group_by(${g}) %>%`,
    '  summarize(',
    '    n = n(),',
    `    mean = mean(${v}, na.rm = TRUE),`,
    `    median = median(${v}, na.rm = TRUE),`,
    `    sd = sd(${v}, na.rm = TRUE)`,
    '  )',
  );
}

/** A line over time: rows per hour (a date-time column) or per day (a date column), one line per group. */
export function chosenLine(v2v: boolean, data: string, time: string, unit: 'hour' | 'day', group?: string): string {
  const t = rName(time);
  const g = group ? rName(group) : undefined;
  return lines(
    banner(`Line chart: rows per ${unit} of ${time}`),
    `# Round each ${time} down to its ${unit} with floor_date(), then count the rows in each ${unit}.`,
    ...(g ? [`# Each value of ${group} gets its own count.`] : []),
    '# Rows with no time are dropped first. This line prints nothing.',
    `per_${unit} <- ${data} %>%`,
    `  filter(!is.na(${t})${g ? `, !is.na(${g})` : ''}) %>%`,
    `  mutate(${unit} = floor_date(${t}, "${unit}")) %>%`,
    `  count(${unit}${g ? `, ${g}` : ''})`,
    '',
    `# Time on the x axis and the count on the y${g ? `, one colored line per value of ${group}` : ''}.`,
    '# A line implies order, so it is right for time and wrong for unordered groups.',
    `per_${unit} %>%`,
    `  ggplot(aes(x = ${unit}, y = n${g ? `, color = factor(${g})` : ''})) +`,
    '  geom_line() +',
    ...labsLines(v2v, g ? ['    color = "YOUR TURN: what the colors stand for",'] : []),
    ...save(v2v, `${slug(time)}-line`),
  );
}

// ---------------- MC 427 tests on the student's own columns (plain tidyverse) ----------------
// Each drops the rows missing a column it uses first, so every line below uses the same rows.

function dropMissing(data: string, cols: string[]): string[] {
  return [
    `# Keep the rows that have a value in ${cols.length > 1 ? 'every column the test uses' : 'the column the test uses'}, so every line below uses`,
    '# the same rows. This line prints nothing.',
    `tested <- ${data} %>%`,
    `  filter(${cols.map((c) => `!is.na(${c})`).join(', ')})`,
    '',
  ];
}

export function chosenTTest(data: string, outcome: string, group: string): string {
  const y = rName(outcome);
  const g = rName(group);
  return lines(
    banner(`Welch t-test: ${outcome} by ${group}`),
    ...dropMissing(data, [y, g]),
    '# The size, mean, and standard deviation of each group. The write-up needs all three,',
    '# and the test below does not print the group sizes.',
    'tested %>%',
    `  group_by(${g}) %>%`,
    '  summarize(',
    '    n = n(),',
    `    mean = mean(${y}),`,
    `    sd = sd(${y})`,
    '  )',
    '',
    '# The test. broom::tidy() turns the result into a one-row table: estimate1 and estimate2',
    `# are the two group means, in the order the table above lists ${group}, statistic is t,`,
    "# parameter is the df (Welch's, so it can have decimals; it is not the sample size), and",
    '# p.value is p. The group column must have exactly two values.',
    `t.test(${y} ~ ${g}, data = tested) %>%`,
    '  broom::tidy()',
    '',
    "# The effect size: Cohen's d with its 95% confidence interval.",
    `effectsize::cohens_d(${y} ~ ${g}, data = tested)`,
  );
}

export function chosenChiSquare(data: string, a: string, b: string): string {
  const x = rName(a);
  const z = rName(b);
  return lines(
    banner(`Chi-square test: ${a} by ${b}`),
    ...dropMissing(data, [x, z]),
    `# The observed counts: one row per value of ${a}, one column per value of ${b}.`,
    'tested %>%',
    `  count(${x}, ${z}) %>%`,
    `  pivot_wider(names_from = ${z}, values_from = n, values_fill = 0)`,
    '',
    '# The same counts in the form the test reads. Name it counts, so the lines below reuse it.',
    `counts <- xtabs(~ ${x} + ${z}, data = tested)`,
    '',
    '# The counts the test expected if the two were unrelated. Check that none is below 5.',
    'counts %>%',
    '  chisq.test() %>%',
    '  pluck("expected") %>%',
    '  round(2)',
    '',
    '# The test: X-squared is chi-square, df is its degrees of freedom, and p-value is p.',
    'counts %>%',
    '  chisq.test()',
    '',
    '# The number of rows in the table, for the write-up.',
    'sum(counts)',
    '',
    "# The effect size: Cramer's V with its 95% confidence interval.",
    'effectsize::cramers_v(counts)',
  );
}

export function chosenAnova(data: string, outcome: string, group: string): string {
  const y = rName(outcome);
  const g = rName(group);
  return lines(
    banner(`One-way ANOVA: ${outcome} by ${group}`),
    ...dropMissing(data, [y, g]),
    '# The size, mean, and standard deviation of each group.',
    'tested %>%',
    `  group_by(${g}) %>%`,
    '  summarize(',
    '    n = n(),',
    `    mean = mean(${y}),`,
    `    sd = sd(${y})`,
    '  )',
    '',
    '# Fit the model and name it fit, so the lines below reuse it. factor() treats each value of',
    `# ${group} as a group, even when it is a number. Prints nothing.`,
    `fit <- aov(${y} ~ factor(${g}), data = tested)`,
    '',
    `# The test, as a table: the factor(${group}) row holds F (statistic), its df, and p.value;`,
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
}

export function chosenRegression(data: string, outcome: string, predictor: string): string {
  const y = rName(outcome);
  const x = rName(predictor);
  return lines(
    banner(`Regression: does ${predictor} predict ${outcome}?`),
    '# Fit the line and name it fit, so the lines below reuse it. lm() leaves out a row missing',
    '# either column by itself. Prints nothing.',
    `fit <- lm(${y} ~ ${x}, data = ${data})`,
    '',
    `# One row per term. The ${predictor} row holds the slope (estimate), its p.value,`,
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
}

export function chosenCorrelation(data: string, a: string, b: string): string {
  return lines(
    banner(`Correlation: ${a} and ${b}`),
    "# Pearson's r as a one-row table: estimate is r, statistic is t, parameter is the df,",
    '# and conf.low and conf.high are its 95% interval. A row missing either column is left out.',
    `cor.test(~ ${rName(a)} + ${rName(b)}, data = ${data}) %>%`,
    '  broom::tidy()',
  );
}
