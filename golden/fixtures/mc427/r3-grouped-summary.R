# ---- Summary by group: group_by() and summarize() ----
# For each value of share_button: how many posts, and the mean, median, and
# standard deviation of like_count.
df %>%
  group_by(share_button) %>%
  summarize(
    n = n(),
    mean = mean(like_count),
    median = median(like_count),
    sd = sd(like_count)
  )
