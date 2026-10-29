# ---- Crosstab: count every pair of platform and tone_code ----
# Drop the rows missing either column first.
# One row per pair of platform and tone_code, with n, how many rows have that pair, then prop:
# the share of each platform value's rows in each tone_code value (prop adds up to 1 within
# each platform value).
posts %>%
  filter(!is.na(platform), !is.na(tone_code)) %>%
  count(platform, tone_code) %>%
  group_by(platform) %>%
  mutate(prop = round(n / sum(n), 3)) %>%
  ungroup()

# The same counts spread into a grid: one row per platform value, one column per tone_code value.
posts %>%
  filter(!is.na(platform), !is.na(tone_code)) %>%
  count(platform, tone_code) %>%
  pivot_wider(names_from = tone_code, values_from = n, values_fill = 0)
