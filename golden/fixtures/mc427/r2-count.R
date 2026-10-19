# ---- Count the rows in each group: count() ----
# One row per value of posted_from, largest first. The n column adds up to the rows in df.
df %>%
  count(posted_from, sort = TRUE)
