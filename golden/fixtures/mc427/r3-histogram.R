# ---- Histogram: how one number is spread out ----
# Each bar counts the posts whose word_count falls in a 5-word band.
ggplot(df, aes(x = word_count)) +
  geom_histogram(binwidth = 5) +
  labs(
    title = "Post length in words",
    x = "Words per post",
    y = "Posts",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  )

# Save the chart to a picture file in your course folder.
ggsave("word-count-histogram.png", width = 7, height = 5)
