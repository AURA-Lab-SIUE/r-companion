# ---- Crosstab: count every pair of phase and share_button ----
# One row per pair of phase and share_button, with n, how many rows have that pair, then prop:
# the share of each phase value's rows in each share_button value (prop adds up to 1 within
# each phase value). A blank cell counts as NA.
df %>%
  count(phase, share_button) %>%
  group_by(phase) %>%
  mutate(prop = round(n / sum(n), 3)) %>%
  ungroup()

# The same counts spread into a grid: one row per phase value, one column per share_button value.
df %>%
  count(phase, share_button) %>%
  pivot_wider(names_from = share_button, values_from = n, values_fill = 0)
