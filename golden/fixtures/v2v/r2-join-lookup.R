# ---- Join the channel labels onto every message: left_join() ----
# Keeps every message and adds the five label columns from the row with the same channel,
# the join key. A message whose channel has no label gets NA. Changes chat_streams; prints nothing.
chat_streams <- chat_streams %>%
  left_join(channels, by = "channel")

# Check the join: messages from gaming channels (TRUE), the others (FALSE), and unlabeled (NA).
chat_streams %>%
  count(is_gaming)
