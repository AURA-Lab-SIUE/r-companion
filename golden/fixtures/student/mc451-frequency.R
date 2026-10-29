# ---- Frequency table: count() and a percent column ----
# Count each channel type, then add each count's share of the total, in percent.
posts %>%
  count(platform, sort = TRUE) %>%
  mutate(percent = round(100 * n / sum(n), 1))
