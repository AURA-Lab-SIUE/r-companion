# ---- One-way ANOVA: views by platform ----
# Keep the rows that have a value in every column the test uses, so every line below uses
# the same rows. This line prints nothing.
tested <- posts %>%
  filter(!is.na(views), !is.na(platform))

# The size, mean, and standard deviation of each group.
tested %>%
  group_by(platform) %>%
  summarize(
    n = n(),
    mean = mean(views),
    sd = sd(views)
  )

# Fit the model and name it fit, so the lines below reuse it. factor() treats each value of
# platform as a group, even when it is a number. Prints nothing.
fit <- aov(views ~ factor(platform), data = tested)

# The test, as a table: the factor(platform) row holds F (statistic), its df, and p.value;
# the Residuals row holds the second df.
fit %>%
  broom::tidy()

# The effect size: eta squared, the share of the variation the groups explain.
effectsize::eta_squared(fit)

# The n: the rows the model used.
fit %>%
  broom::glance() %>%
  select(nobs)

# Which pairs of groups differ: Tukey's follow-up test, one row per pair.
TukeyHSD(fit) %>%
  broom::tidy()
