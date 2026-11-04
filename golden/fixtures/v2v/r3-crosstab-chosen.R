# ---- Crosstab: count every pair of channel_type and viewer_band ----
# The counts as a grid: one row per channel_type value, one column per viewer_band value. Rows
# missing either column are dropped first, and a pair that never occurs shows 0.
analysis %>%
  filter(!is.na(channel_type), !is.na(viewer_band)) %>%
  count(channel_type, viewer_band) %>%
  pivot_wider(names_from = viewer_band, values_from = n, values_fill = 0)

# The same counts as shares: within each channel_type value, the share of its rows in each
# viewer_band value (the shares for one channel_type value add up to 1).
analysis %>%
  filter(!is.na(channel_type), !is.na(viewer_band)) %>%
  count(channel_type, viewer_band) %>%
  group_by(channel_type) %>%
  mutate(share = round(n / sum(n), 3))
