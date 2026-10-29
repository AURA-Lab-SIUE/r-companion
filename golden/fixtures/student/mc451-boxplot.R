# ---- Boxplot: follower_count, compared across platform ----
# One box per value of platform. The line in each box is the median; the box holds the middle
# half of the rows. Rows missing either column are dropped first. factor() makes one box per
# value even when platform is a number or TRUE/FALSE.
posts %>%
  filter(!is.na(platform), !is.na(follower_count)) %>%
  ggplot(aes(x = factor(platform), y = follower_count)) +
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
ggsave("figures/follower-count-by-platform-boxplot.png", width = 7, height = 5)
