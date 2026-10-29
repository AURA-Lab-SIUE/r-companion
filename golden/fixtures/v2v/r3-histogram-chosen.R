# ---- Histogram: how message_length is spread out ----
# Each bar counts the rows whose message_length falls in its band. bins = 30 draws 30 bars; change
# it to see more or fewer. Rows with no value are dropped first.
analysis %>%
  filter(!is.na(message_length)) %>%
  ggplot(aes(x = message_length)) +
  geom_histogram(bins = 30) +
  # Write the counts with commas (12,000), not 12000.
  scale_y_continuous(labels = scales::label_comma()) +
  labs(
    title = "YOUR TURN: a title that says what the chart shows",
    x = "YOUR TURN: what the x axis measures",
    y = "YOUR TURN: what the y axis measures",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  ) +
  v2v::theme_v2v()

# Save the chart to a picture file in your figures folder.
dir.create("figures", showWarnings = FALSE)
ggsave("figures/message-length-histogram.png", width = 7, height = 5)
