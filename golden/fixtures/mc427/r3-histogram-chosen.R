# ---- Histogram: how word_count is spread out ----
# Each bar counts the rows whose word_count falls in its band. bins = 30 draws 30 bars; change
# it to see more or fewer. Rows with no value are dropped first.
df %>%
  filter(!is.na(word_count)) %>%
  ggplot(aes(x = word_count)) +
  geom_histogram(bins = 30) +
  labs(
    title = "YOUR TURN: a title that says what the chart shows",
    x = "YOUR TURN: what the x axis measures",
    y = "YOUR TURN: what the y axis measures",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  )

# Save the chart to a picture file in your course folder.
ggsave("word-count-histogram.png", width = 7, height = 5)
