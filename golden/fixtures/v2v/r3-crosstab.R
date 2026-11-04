# ---- Crosstab: count every pair of two columns ----
# The counts as a grid: one row per viewer band, one column per channel type. Messages
# with no channel type (the two channels with no category) are dropped first.
analysis %>%
  filter(!is.na(channel_type)) %>%
  count(viewer_band, channel_type) %>%
  pivot_wider(names_from = channel_type, values_from = n, values_fill = 0)

# The same counts as shares: within each band, the share of its messages in each channel
# type (the two shares for one band add up to 1).
analysis %>%
  filter(!is.na(channel_type)) %>%
  count(viewer_band, channel_type) %>%
  group_by(viewer_band) %>%
  mutate(share = round(n / sum(n), 3))
