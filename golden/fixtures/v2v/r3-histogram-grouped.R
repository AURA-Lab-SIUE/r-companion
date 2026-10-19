# ---- Grouped histogram: two groups overlaid ----
# Each bar counts the messages whose length falls in a 5-character band, drawn once per group so
# the two shapes overlay. Rows with no channel label or no message length are dropped first, and
# lengths are capped at 120 for the picture only. position = "identity" puts both groups on the
# same baseline, and alpha makes each one see-through so the overlap shows.
analysis %>%
  filter(!is.na(is_gaming), !is.na(message_length)) %>%
  mutate(length_shown = pmin(message_length, 120)) %>%
  ggplot(aes(x = length_shown, fill = is_gaming)) +
  geom_histogram(binwidth = 5, position = "identity", alpha = 0.55) +
  v2v::scale_fill_v2v() +
  labs(
    title = "Message length by channel type",
    subtitle = "Two groups overlaid, lengths capped at 120 characters",
    x = "Message length (characters, capped at 120)",
    y = "Messages",
    fill = "Gaming channel",
    caption = "Source: v2v package, November 2018 Twitch collection",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  ) +
  v2v::theme_v2v()

# Save the chart to a picture file in your figures folder.
dir.create("figures", showWarnings = FALSE)
ggsave("figures/message-length-grouped-histogram.png", width = 7, height = 5)
