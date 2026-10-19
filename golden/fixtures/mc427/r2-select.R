# ---- Keep the columns you want: select() ----
# Keep three columns, then look at them. The rows are all still there.
df %>%
  select(update, posted_from, like_count) %>%
  glimpse()
