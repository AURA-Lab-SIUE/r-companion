# ---- Frequency table: count() and a percent column ----
# Count each value of posted_from, then add each count's share of the total, in percent.
df %>%
  count(posted_from, sort = TRUE) %>%
  mutate(percent = round(100 * n / sum(n), 1))
