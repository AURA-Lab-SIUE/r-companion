# ---- Summary by group: watch_minutes for each value of platform ----
# For each value of platform: how many rows, and the mean, median, and standard deviation of
# watch_minutes. Rows with no platform are dropped first; na.rm = TRUE skips a missing watch_minutes.
posts %>%
  filter(!is.na(platform)) %>%
  group_by(platform) %>%
  summarize(
    n = n(),
    mean = mean(watch_minutes, na.rm = TRUE),
    median = median(watch_minutes, na.rm = TRUE),
    sd = sd(watch_minutes, na.rm = TRUE)
  )
