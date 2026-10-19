# ---- Match each message to its stream: join_chat_streams() ----
# Attaches the game and viewer count of the latest stream snapshot taken at or before each
# message, on the same channel. Both tables need the ts column from clean_dates(). The same
# join without v2v: left_join(chat, streams, by = join_by(channel, closest(ts >= ts))).
# The message keeps its time as ts, and the snapshot time comes back as snapshot_ts.
# Prints nothing.
chat_streams <- join_chat_streams(chat, streams)

# Count the messages that found a snapshot (FALSE) and those that did not (TRUE).
chat_streams %>%
  count(no_snapshot = is.na(viewers))
