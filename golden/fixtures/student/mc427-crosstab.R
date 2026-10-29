# ---- Crosstab: count every pair of platform and has_caption ----
# One row per pair of platform and has_caption, with n, how many rows have that pair, then prop:
# the share of each platform value's rows in each has_caption value (prop adds up to 1 within
# each platform value). A blank cell counts as NA.
posts %>%
  count(platform, has_caption) %>%
  group_by(platform) %>%
  mutate(prop = round(n / sum(n), 3)) %>%
  ungroup()

# The same counts spread into a grid: one row per platform value, one column per has_caption value.
posts %>%
  count(platform, has_caption) %>%
  pivot_wider(names_from = has_caption, values_from = n, values_fill = 0)
