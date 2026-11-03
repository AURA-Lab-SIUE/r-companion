# ---- Join two tables by a shared column: left_join() ----
# Keep every row of chat and add the columns of channels whose channel matches. A row whose
# channel is not in channels gets NA in the new columns. chat itself does not change: the result
# is a new table named chat_channels. Prints nothing.
chat_channels <- chat %>%
  left_join(channels, by = join_by(channel))

# Check the join two ways: the row count should equal the rows in chat (a bigger number means
# channel repeats in channels), and the second count says how many rows found no match.
nrow(chat_channels)
chat %>%
  anti_join(channels, by = join_by(channel)) %>%
  nrow()
