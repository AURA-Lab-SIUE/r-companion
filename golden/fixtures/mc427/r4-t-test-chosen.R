# ---- Welch t-test: like_count by share_button ----
# Keep the rows that have a value in every column the test uses, so every line below uses
# the same rows. This line prints nothing.
tested <- df %>%
  filter(!is.na(like_count), !is.na(share_button))

# The size, mean, and standard deviation of each group. The write-up needs all three,
# and the test below does not print the group sizes.
tested %>%
  group_by(share_button) %>%
  summarize(
    n = n(),
    mean = mean(like_count),
    sd = sd(like_count)
  )

# The test. broom::tidy() turns the result into a one-row table: estimate1 and estimate2
# are the two group means, in the order the table above lists share_button, statistic is t,
# parameter is the df (Welch's, so it can have decimals; it is not the sample size), and
# p.value is p. The group column must have exactly two values.
t.test(like_count ~ share_button, data = tested) %>%
  broom::tidy()

# The effect size: Cohen's d with its 95% confidence interval.
effectsize::cohens_d(like_count ~ share_button, data = tested)
