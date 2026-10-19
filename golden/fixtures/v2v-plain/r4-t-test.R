# ---- Welch t-test: outcome by group2, with the functions run_t_test() wraps ----
# PROPOSED for the stepping-stone audit; not a course dialect.
# The test as a one-row table: estimate1 and estimate2 are the group means, statistic is t,
# parameter is the df, and p.value is p.
t.test(outcome ~ group2, data = analysis) %>%
  broom::tidy()

# Cohen's d with its 95% interval (pooled SD, the same d run_t_test() prints).
effectsize::cohens_d(outcome ~ group2, data = analysis)
