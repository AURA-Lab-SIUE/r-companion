# ---- Count the rows in each group: count() ----
# One row per channel type, largest first. The n column adds up to the rows in analysis.
analysis %>%
  count(channel_type, sort = TRUE)
