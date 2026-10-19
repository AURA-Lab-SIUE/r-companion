# ---- Crosstab: count every pair of two columns ----
# Drop the rows missing either column, then one row per pair with its count, then prop:
# the share of each viewer band's messages in each channel type (adds up to 1 per band).
analysis %>%
  filter(!is.na(viewer_band), !is.na(channel_type)) %>%
  count(viewer_band, channel_type) %>%
  group_by(viewer_band) %>%
  mutate(prop = round(n / sum(n), 3)) %>%
  ungroup()

# The same counts spread into a grid: one row per viewer band, one column per channel type.
analysis %>%
  filter(!is.na(viewer_band), !is.na(channel_type)) %>%
  count(viewer_band, channel_type) %>%
  pivot_wider(names_from = channel_type, values_from = n, values_fill = 0)
