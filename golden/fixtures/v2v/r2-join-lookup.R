# ---- Join the channel labels onto every message: left_join() ----
# Keeps every message and adds main_game and is_gaming from the row with the same channel,
# the join key. A message whose channel has no label gets NA. Changes chat_streams; prints nothing.
chat_streams <- chat_streams %>%
  left_join(channel_type, by = "channel")

# Check the join: messages from gaming channels (TRUE), the others (FALSE), and unlabeled (NA).
chat_streams %>%
  count(is_gaming)
