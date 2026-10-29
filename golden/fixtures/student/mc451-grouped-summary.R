# ---- Summary by group: views for each value of platform ----
# For each value of platform: how many rows, and the mean, median, and standard deviation of
# views. Rows with no platform are dropped first; na.rm = TRUE skips a missing views.
posts %>%
  filter(!is.na(platform)) %>%
  group_by(platform) %>%
  summarize(
    n = n(),
    mean = mean(views, na.rm = TRUE),
    median = median(views, na.rm = TRUE),
    sd = sd(views, na.rm = TRUE)
  )
