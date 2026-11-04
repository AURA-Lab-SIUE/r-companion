# ---- Welch t-test: outcome by group2 ----
# The size, mean, and standard deviation of each group. The write-up needs all three, and
# the test below does not print the group sizes. Rows missing either column are dropped
# first, so n matches the rows the test uses.
analysis %>%
  filter(!is.na(outcome), !is.na(group2)) %>%
  group_by(group2) %>%
  summarize(n = n(), mean = mean(outcome), sd = sd(outcome))

# The test. t is the test statistic, df is Welch's degrees of freedom (it can have decimals),
# and p-value is p. The two means print at the bottom, in the order the table above lists
# the groups.
t.test(outcome ~ group2, data = analysis)

# The effect size: Cohen's d with its 95% confidence interval. Below 0.2 is negligible, 0.2
# small, 0.5 medium, and 0.8 or more large.
cohens_d(outcome ~ group2, data = analysis)
