# ---- One-way ANOVA: log_likes by update ----
# The size, mean, and standard deviation of each group.
df %>%
  group_by(update) %>%
  summarize(
    n = n(),
    mean = mean(log_likes),
    sd = sd(log_likes)
  )

# Fit the model and name it fit, so the lines below reuse it. Prints nothing.
fit <- aov(log_likes ~ update, data = df)

# The test, as a table: the update row holds F (statistic), its df, and p.value;
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
