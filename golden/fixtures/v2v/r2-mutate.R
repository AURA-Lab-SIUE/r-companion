# ---- Add a new column: mutate() ----
# Add message_length, the number of characters in each message. Changes chat; prints nothing.
chat <- chat %>%
  mutate(message_length = str_length(message))

# Check the new column beside the one it came from, in the first three rows.
chat %>%
  select(message, message_length) %>%
  slice_head(n = 3)
