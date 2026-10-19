# ---- Correlation: predictor and outcome ----
# Pearson's r as a one-row table: estimate is r, statistic is t, parameter is the df,
# and conf.low and conf.high are its 95% interval.
cor.test(~ predictor + outcome, data = analysis) %>%
  broom::tidy()
