# ---- Boxplot: message_length, compared across viewer_band ----
# One box per value of viewer_band. The line in each box is the median; the box holds the middle
# half of the rows. Rows missing either column are dropped first. factor() makes one box per
# value even when viewer_band is a number or TRUE/FALSE.
analysis %>%
  filter(!is.na(viewer_band), !is.na(message_length)) %>%
  ggplot(aes(x = factor(viewer_band), y = message_length)) +
  geom_boxplot() +
  labs(
    title = "YOUR TURN: a title that says what the chart shows",
    x = "YOUR TURN: what the x axis measures",
    y = "YOUR TURN: what the y axis measures",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  ) +
  v2v::theme_v2v()

# Save the chart to a picture file in your figures folder.
dir.create("figures", showWarnings = FALSE)
ggsave("figures/message-length-by-viewer-band-boxplot.png", width = 7, height = 5)
