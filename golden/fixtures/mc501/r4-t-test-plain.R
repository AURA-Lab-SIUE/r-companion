# ---- Welch t-test: outcome by group2 ----
# The size, mean, and standard deviation of each group. The APA report needs the n,
# and the test does not print it.
analysis %>%
  filter(!is.na(outcome), !is.na(group2)) %>%
  group_by(group2) %>%
  summarize(
    n = n(),
    mean = mean(outcome),
    sd = sd(outcome)
  )

# The Welch t-test as a one-row table: estimate1 and estimate2 are the group means,
# statistic is t, parameter is the df, and p.value is p.
t.test(outcome ~ group2, data = analysis) %>%
  broom::tidy()

# Cohen's d with its 95% interval.
effectsize::cohens_d(outcome ~ group2, data = analysis)

# Check: the v2v wrapper prints the same t, df, p, and Cohen's d.
run_t_test(analysis, value = outcome, group = group2)
