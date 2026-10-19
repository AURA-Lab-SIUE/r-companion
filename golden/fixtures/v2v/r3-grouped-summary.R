# ---- Summary by group: group_by() and summarize() ----
# For each channel type: how many messages, and the mean, median, and standard deviation
# of message_length. Rows with no channel type are dropped first.
analysis %>%
  filter(!is.na(channel_type)) %>%
  group_by(channel_type) %>%
  summarize(
    n = n(),
    mean = mean(message_length, na.rm = TRUE),
    median = median(message_length, na.rm = TRUE),
    sd = sd(message_length, na.rm = TRUE)
  )
