# ---- Crosstab: count every pair of platform and tone_code ----
# The counts as a grid: one row per platform value, one column per tone_code value. Rows
# missing either column are dropped first, and a pair that never occurs shows 0.
posts %>%
  filter(!is.na(platform), !is.na(tone_code)) %>%
  count(platform, tone_code) %>%
  pivot_wider(names_from = tone_code, values_from = n, values_fill = 0)

# The same counts as shares: within each platform value, the share of its rows in each
# tone_code value (the shares for one platform value add up to 1).
posts %>%
  filter(!is.na(platform), !is.na(tone_code)) %>%
  count(platform, tone_code) %>%
  group_by(platform) %>%
  mutate(share = round(n / sum(n), 3))
