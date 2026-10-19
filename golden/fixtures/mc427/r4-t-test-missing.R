# ---- Welch t-test: playtime_at_review_min by voted_up ----
# One or more rows have no playtime_at_review_min. Drop them first, so every line below
# uses the same rows. This line prints nothing.
tested <- steam %>%
  filter(!is.na(playtime_at_review_min))

# The size, mean, and standard deviation of each group.
tested %>%
  group_by(voted_up) %>%
  summarize(
    n = n(),
    mean = mean(playtime_at_review_min),
    sd = sd(playtime_at_review_min)
  )

# The test, as a one-row table: estimate1 is the FALSE group, estimate2 the TRUE group.
t.test(playtime_at_review_min ~ voted_up, data = tested) %>%
  broom::tidy()

# The effect size: Cohen's d with its 95% confidence interval.
effectsize::cohens_d(playtime_at_review_min ~ voted_up, data = tested)
