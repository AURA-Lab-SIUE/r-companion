# ---- Correlation: word_count and like_count ----
# Pearson's r as a one-row table: estimate is r, statistic is t, parameter is the df,
# and conf.low and conf.high are its 95% interval.
cor.test(~ word_count + like_count, data = df) %>%
  broom::tidy()
