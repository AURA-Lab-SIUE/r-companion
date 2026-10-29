# ---- Histogram: how Follower Count is spread out ----
# Each bar counts the rows whose Follower Count falls in its band. bins = 30 draws 30 bars; change
# it to see more or fewer. Rows with no value are dropped first.
posts %>%
  filter(!is.na(`Follower Count`)) %>%
  ggplot(aes(x = `Follower Count`)) +
  geom_histogram(bins = 30) +
  labs(
    title = "YOUR TURN: a title that says what the chart shows",
    x = "YOUR TURN: what the x axis measures",
    y = "YOUR TURN: what the y axis measures",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  )

# Save the chart to a picture file in your course folder.
ggsave("follower-count-histogram.png", width = 7, height = 5)
