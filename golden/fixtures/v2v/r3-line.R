# ---- Line chart: a total over time ----
# The course package ships the stream snapshots already bucketed into six-hour blocks, with
# the five biggest game categories kept and the rest lumped into "Other", and the viewers
# in each block added up. Run ?twitch_viewers_over_time to read how it was built. Prints nothing.
viewers_over_time <- twitch_viewers_over_time()

# One line per game category: time on the x axis, summed viewers on the y, color by category.
# A line implies order, so it is right for time and wrong for unordered groups. Inside ggplot()
# the pieces join with +, not the pipe.
viewers_over_time %>%
  ggplot(aes(x = six_hour, y = total_viewers, color = category)) +
  geom_line(linewidth = 0.9) +
  # Write the viewer counts with commas (20,000,000), not in scientific notation (2.0e+07).
  scale_y_continuous(labels = scales::label_comma()) +
  labs(
    title = "Concurrent viewers by game category",
    x = "Date (UTC, six-hour buckets)",
    y = "Total viewers in bucket",
    color = "Category",
    caption = "Source: v2v package, November 2018 Twitch collection",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  ) +
  v2v::scale_colour_v2v() +
  v2v::theme_v2v()

# Save the chart to a picture file in your figures folder.
dir.create("figures", showWarnings = FALSE)
ggsave("figures/viewers-over-time-line.png", width = 7, height = 5)
