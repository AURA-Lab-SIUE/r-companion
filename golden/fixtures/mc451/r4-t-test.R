# ---- Welch t-test: outcome by group2 ----
# The size, mean, and standard deviation of each group. The APA report needs the n,
# and run_t_test() does not print it.
analysis %>%
  filter(!is.na(outcome), !is.na(group2)) %>%
  group_by(group2) %>%
  summarize(
    n = n(),
    mean = mean(outcome),
    sd = sd(outcome)
  )

# The test with its effect size. Prints the two means, t, df, p, and Cohen's d.
run_t_test(analysis, value = outcome, group = group2)
