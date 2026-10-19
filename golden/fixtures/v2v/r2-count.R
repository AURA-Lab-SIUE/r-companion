# ---- Count the rows in each group: count() ----
# One row per value of channel, largest first. The n column adds up to the rows in chat.
chat %>%
  count(channel, sort = TRUE)
