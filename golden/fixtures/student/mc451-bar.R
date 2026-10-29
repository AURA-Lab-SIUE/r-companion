# ---- Bar chart: one bar per value of tone_code ----
# Count the rows for each value of tone_code, keep the 15 biggest (a tie can keep a few more),
# then draw one bar per value, longest at the top. Rows with no value are dropped first.
# as.character() lets a TRUE/FALSE or number column work too. Inside ggplot() the pieces join
# with +, not the pipe.
posts %>%
  filter(!is.na(tone_code)) %>%
  count(tone_code) %>%
  slice_max(n, n = 15) %>%
  ggplot(aes(x = fct_reorder(as.character(tone_code), n), y = n)) +
  geom_col() +
  coord_flip() +
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
ggsave("figures/tone-code-bar.png", width = 7, height = 5)
