# ---- Boxplot: one number, compared across groups ----
# One box per value of share_button. The line in each box is the median; the box holds
# the middle half of the posts. log1p() keeps the few viral posts from flattening the boxes.
ggplot(df, aes(x = share_button, y = log1p(like_count))) +
  geom_boxplot() +
  labs(
    title = "Likes by share button",
    x = "Sent with a console's share button",
    y = "Likes, log(1 + likes)",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  )

# Save the chart to a picture file in your course folder.
ggsave("likes-boxplot.png", width = 7, height = 5)
