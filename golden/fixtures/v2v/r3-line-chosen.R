# ---- Line chart: rows per hour of ts ----
# Round each ts down to its hour with floor_date(), then count the rows in each hour.
# Each value of channel_type gets its own count.
# Rows with no time are dropped first. This line prints nothing.
per_hour <- analysis %>%
  filter(!is.na(ts), !is.na(channel_type)) %>%
  mutate(hour = floor_date(ts, "hour")) %>%
  count(hour, channel_type)

# Time on the x axis and the count on the y, one colored line per value of channel_type.
# A line implies order, so it is right for time and wrong for unordered groups.
per_hour %>%
  ggplot(aes(x = hour, y = n, color = factor(channel_type))) +
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
ggsave("figures/ts-line.png", width = 7, height = 5)
