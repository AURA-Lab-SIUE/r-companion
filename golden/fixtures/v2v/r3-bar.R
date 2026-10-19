# ---- Bar chart: one bar per category ----
# Count the stream snapshots in each game, keep the ten largest, then draw one bar per game,
# longest at the top. Inside ggplot() the pieces join with +, not the pipe. The bars share
# one color: the axis already names each game, and the course palette stops at 8 colors.
streams %>%
  filter(!is.na(game)) %>%
  count(game) %>%
  slice_max(n, n = 10) %>%
  ggplot(aes(x = fct_reorder(game, n), y = n)) +
  geom_col() +
  coord_flip() +
  labs(
    title = "Most-streamed categories",
    x = NULL,
    y = "Stream snapshots",
    caption = "Source: v2v package, November 2018 Twitch collection",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  ) +
  v2v::theme_v2v()

# Save the chart to a picture file in your figures folder.
dir.create("figures", showWarnings = FALSE)
ggsave("figures/top-games-bar.png", width = 7, height = 5)
