# ---- Join two tables by a shared column: left_join() ----
# Keep every row of chat and add the columns of channel_type whose channel matches. A row whose
# channel is not in channel_type gets NA in the new columns. chat itself does not change: the
# result is a new table named chat_channel_type. Prints nothing.
chat_channel_type <- chat %>%
  left_join(channel_type, by = join_by(channel))

# Check the join two ways: the row count should equal the rows in chat (a bigger number means
# channel repeats in channel_type), and the second count says how many rows found no match.
nrow(chat_channel_type)
chat %>%
  anti_join(channel_type, by = join_by(channel)) %>%
  nrow()
