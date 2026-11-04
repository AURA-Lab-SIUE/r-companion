# ---- Join two tables by a key and nearest earlier time: left_join() ----
# Keep the four stream columns the question needs, and rename the snapshot time to
# snapshot_ts so it cannot be confused with the message time. Prints nothing.
snapshots <- streams %>%
  select(channel, snapshot_ts = ts, game, viewers)

# Attach to each message the game and viewer count of the latest snapshot taken at or
# before it, on the same channel. join_by() names the key: the same channel, and the
# snapshot time closest to the message time without passing it (a rolling join).
# left_join() keeps every message; one with no earlier snapshot gets NA. Prints nothing.
chat_streams <- chat %>%
  left_join(
    snapshots,
    by = join_by(channel, closest(ts >= snapshot_ts))
  )

# Count the messages that found a snapshot (FALSE) and those that did not (TRUE).
chat_streams %>%
  count(no_snapshot = is.na(viewers))
