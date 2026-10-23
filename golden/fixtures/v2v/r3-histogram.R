# ---- Histogram: how one number is spread out ----
# Each bar counts the messages whose length falls in a 5-character band. Lengths over 200
# are dropped from the picture only, so the long tail does not squash the bars.
analysis %>%
  filter(message_length <= 200) %>%
  ggplot(aes(x = message_length)) +
  geom_histogram(binwidth = 5) +
  # Write the counts with commas (12,000), not 12000.
  scale_y_continuous(labels = scales::label_comma()) +
  labs(
    title = "Message length",
    subtitle = "Messages up to 200 characters",
    x = "Characters per message",
    y = "Messages",
    caption = "Source: v2v package, November 2018 Twitch collection",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  ) +
  v2v::theme_v2v()

# Save the chart to a picture file in your figures folder.
dir.create("figures", showWarnings = FALSE)
ggsave("figures/message-length-histogram.png", width = 7, height = 5)
