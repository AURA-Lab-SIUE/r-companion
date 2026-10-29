# ---- Summary by group: like_count for each value of share_button ----
# For each value of share_button: how many rows, and the mean, median, and standard deviation of
# like_count. Rows with no share_button are dropped first; na.rm = TRUE skips a missing like_count.
df %>%
  filter(!is.na(share_button)) %>%
  group_by(share_button) %>%
  summarize(
    n = n(),
    mean = mean(like_count, na.rm = TRUE),
    median = median(like_count, na.rm = TRUE),
    sd = sd(like_count, na.rm = TRUE)
  )
