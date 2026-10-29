# ---- Crosstab: count every pair of channel_type and viewer_band ----
# Drop the rows missing either column first.
# One row per pair of channel_type and viewer_band, with n, how many rows have that pair, then prop:
# the share of each channel_type value's rows in each viewer_band value (prop adds up to 1 within
# each channel_type value).
analysis %>%
  filter(!is.na(channel_type), !is.na(viewer_band)) %>%
  count(channel_type, viewer_band) %>%
  group_by(channel_type) %>%
  mutate(prop = round(n / sum(n), 3)) %>%
  ungroup()

# The same counts spread into a grid: one row per channel_type value, one column per viewer_band value.
analysis %>%
  filter(!is.na(channel_type), !is.na(viewer_band)) %>%
  count(channel_type, viewer_band) %>%
  pivot_wider(names_from = viewer_band, values_from = n, values_fill = 0)
