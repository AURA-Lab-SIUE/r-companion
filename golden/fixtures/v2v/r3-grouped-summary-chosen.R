# ---- Summary by group: message_length for each value of viewer_band ----
# For each value of viewer_band: how many rows, and the mean, median, and standard deviation of
# message_length. Rows with no viewer_band are dropped first; na.rm = TRUE skips a missing message_length.
analysis %>%
  filter(!is.na(viewer_band)) %>%
  group_by(viewer_band) %>%
  summarize(
    n = n(),
    mean = mean(message_length, na.rm = TRUE),
    median = median(message_length, na.rm = TRUE),
    sd = sd(message_length, na.rm = TRUE)
  )
