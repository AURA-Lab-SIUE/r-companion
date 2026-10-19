# ---- Keep the columns you want: select() ----
# Keep three columns, then look at them. The rows are all still there.
analysis %>%
  select(channel, channel_type, message_length) %>%
  glimpse()
