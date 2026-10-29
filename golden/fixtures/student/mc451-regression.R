# ---- Linear regression: outcome predicted by predictor ----
# Fit the line and name it fit, so the lines below reuse it. Prints nothing.
fit <- lm(outcome ~ predictor, data = analysis)

# The coefficients (the predictor row's Estimate is the slope, in outcome units per unit of
# predictor), R-squared, and the F-statistic with its two df and p-value.
summary(fit)

# The n: the rows the model used.
fit %>%
  broom::glance() %>%
  select(r.squared, nobs)
