# ---- Crosstab: count every pair of two columns ----
# One row per pair of update and posted_from, with its count, then prop: the share of
# each update's posts that came from each app (prop adds up to 1 within each update).
df %>%
  count(update, posted_from) %>%
  group_by(update) %>%
  mutate(prop = round(n / sum(n), 3)) %>%
  ungroup()

# The same counts spread into a grid: one row per update, one column per app.
df %>%
  count(update, posted_from) %>%
  pivot_wider(names_from = posted_from, values_from = n, values_fill = 0)
