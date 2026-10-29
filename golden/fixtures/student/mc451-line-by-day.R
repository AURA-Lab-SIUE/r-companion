# ---- Line chart: rows per day of post_day ----
# Round each post_day down to its day with floor_date(), then count the rows in each day.
# Rows with no time are dropped first. This line prints nothing.
per_day <- posts %>%
  filter(!is.na(post_day)) %>%
  mutate(day = floor_date(post_day, "day")) %>%
  count(day)

# Time on the x axis and the count on the y.
# A line implies order, so it is right for time and wrong for unordered groups.
per_day %>%
  ggplot(aes(x = day, y = n)) +
  geom_line() +
  labs(
    title = "YOUR TURN: a title that says what the chart shows",
    x = "YOUR TURN: what the x axis measures",
    y = "YOUR TURN: what the y axis measures",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  ) +
  v2v::theme_v2v()

# Save the chart to a picture file in your figures folder.
dir.create("figures", showWarnings = FALSE)
ggsave("figures/post-day-line.png", width = 7, height = 5)
