# ---- Keep the rows you want: filter() ----
# Keep the messages from gaming channels and name the result gaming.
# Text values go in quotation marks. This line prints nothing.
gaming <- analysis %>%
  filter(channel_type == "gaming")

# Count the rows that are left.
nrow(gaming)
