# ---- Correlation: watch_minutes and views ----
# Pearson's r as a one-row table: estimate is r, statistic is t, parameter is the df,
# and conf.low and conf.high are its 95% interval. A row missing either column is left out.
cor.test(~ watch_minutes + views, data = posts) %>%
  broom::tidy()
