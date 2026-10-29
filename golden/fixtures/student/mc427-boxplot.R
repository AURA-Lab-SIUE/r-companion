# ---- Boxplot: views, compared across has_caption ----
# One box per value of has_caption. The line in each box is the median; the box holds the middle
# half of the rows. Rows missing either column are dropped first. factor() makes one box per
# value even when has_caption is a number or TRUE/FALSE.
posts %>%
  filter(!is.na(has_caption), !is.na(views)) %>%
  ggplot(aes(x = factor(has_caption), y = views)) +
  geom_boxplot() +
  labs(
    title = "YOUR TURN: a title that says what the chart shows",
    x = "YOUR TURN: what the x axis measures",
    y = "YOUR TURN: what the y axis measures",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  )

# Save the chart to a picture file in your course folder.
ggsave("views-by-has-caption-boxplot.png", width = 7, height = 5)
