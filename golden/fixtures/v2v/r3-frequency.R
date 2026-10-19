# ---- Frequency table: count() and a percent column ----
# Count each channel type, then add each count's share of the total, in percent.
analysis %>%
  count(channel_type, sort = TRUE) %>%
  mutate(percent = round(100 * n / sum(n), 1))
