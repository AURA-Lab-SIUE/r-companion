# ---- Regression: does Follower Count predict views? ----
# Fit the line and name it fit, so the lines below reuse it. lm() leaves out a row missing
# either column by itself. Prints nothing.
fit <- lm(views ~ `Follower Count`, data = posts)

# One row per term. The Follower Count row holds the slope (estimate), its p.value,
# and its 95% interval (conf.low, conf.high).
fit %>%
  broom::tidy(conf.int = TRUE)

# The whole model in one row: r.squared, F (statistic), its two df, p.value, and nobs,
# the number of rows used.
fit %>%
  broom::glance() %>%
  select(r.squared, statistic, df, df.residual, p.value, nobs)
