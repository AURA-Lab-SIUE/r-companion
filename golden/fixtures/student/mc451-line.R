# ---- Line chart: rows per hour of posted_at ----
# Round each posted_at down to its hour with floor_date(), then count the rows in each hour.
# Each value of platform gets its own count.
# Rows with no time are dropped first. This line prints nothing.
per_hour <- posts %>%
  filter(!is.na(posted_at), !is.na(platform)) %>%
  mutate(hour = floor_date(posted_at, "hour")) %>%
  count(hour, platform)

# Time on the x axis and the count on the y, one colored line per value of platform.
# A line implies order, so it is right for time and wrong for unordered groups.
per_hour %>%
  ggplot(aes(x = hour, y = n, color = factor(platform))) +
  geom_line() +
  labs(
    title = "YOUR TURN: a title that says what the chart shows",
    x = "YOUR TURN: what the x axis measures",
    y = "YOUR TURN: what the y axis measures",
    color = "YOUR TURN: what the colors stand for",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  ) +
  v2v::theme_v2v()

# Save the chart to a picture file in your figures folder.
dir.create("figures", showWarnings = FALSE)
ggsave("figures/posted-at-line.png", width = 7, height = 5)
