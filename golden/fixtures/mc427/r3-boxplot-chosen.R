# ---- Boxplot: like_count, compared across share_button ----
# One box per value of share_button. The line in each box is the median; the box holds the middle
# half of the rows. Rows missing either column are dropped first. factor() makes one box per
# value even when share_button is a number or TRUE/FALSE.
df %>%
  filter(!is.na(share_button), !is.na(like_count)) %>%
  ggplot(aes(x = factor(share_button), y = like_count)) +
  geom_boxplot() +
  labs(
    title = "YOUR TURN: a title that says what the chart shows",
    x = "YOUR TURN: what the x axis measures",
    y = "YOUR TURN: what the y axis measures",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  )

# Save the chart to a picture file in your course folder.
ggsave("like-count-by-share-button-boxplot.png", width = 7, height = 5)
