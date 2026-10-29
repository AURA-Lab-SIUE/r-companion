# ---- Regression: does word_count predict like_count? ----
# Fit the line and name it fit, so the lines below reuse it. lm() leaves out a row missing
# either column by itself. Prints nothing.
fit <- lm(like_count ~ word_count, data = df)

# One row per term. The word_count row holds the slope (estimate), its p.value,
# and its 95% interval (conf.low, conf.high).
fit %>%
  broom::tidy(conf.int = TRUE)

# The whole model in one row: r.squared, F (statistic), its two df, p.value, and nobs,
# the number of rows used.
fit %>%
  broom::glance() %>%
  select(r.squared, statistic, df, df.residual, p.value, nobs)
