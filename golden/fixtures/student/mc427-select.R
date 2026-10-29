# ---- Keep the columns you want: select() ----
# Keep three columns, then look at them. The rows are all still there.
posts %>%
  select(post_id, platform, `Follower Count`) %>%
  glimpse()
