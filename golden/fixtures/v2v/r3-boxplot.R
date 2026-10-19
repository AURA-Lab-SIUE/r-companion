# ---- Boxplot: one number, compared across groups ----
# One box per channel type. The line in each box is the median; the box holds the middle
# half of the messages. Rows missing either column are dropped first, and lengths are capped
# at 120 for the picture only.
analysis %>%
  filter(!is.na(channel_type), !is.na(message_length)) %>%
  mutate(length_shown = pmin(message_length, 120)) %>%
  ggplot(aes(x = channel_type, y = length_shown, fill = channel_type)) +
  geom_boxplot(show.legend = FALSE) +
  coord_flip() +
  v2v::scale_fill_v2v() +
  labs(
    title = "Message length by channel type",
    x = NULL,
    y = "Message length (characters, capped at 120)",
    caption = "Source: v2v package, November 2018 Twitch collection",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  ) +
  v2v::theme_v2v()

# Save the chart to a picture file in your figures folder.
dir.create("figures", showWarnings = FALSE)
ggsave("figures/message-length-boxplot.png", width = 7, height = 5)
