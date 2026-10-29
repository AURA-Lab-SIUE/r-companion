# ---- Frequency table: count() and a percent column ----
# Count each value of tone_code, then add each count's share of the total, in percent.
posts %>%
  count(tone_code, sort = TRUE) %>%
  mutate(percent = round(100 * n / sum(n), 1))
