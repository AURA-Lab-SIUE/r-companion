# ---- Bar chart: one bar per category ----
# Count the posts from each app, then draw one bar per app, longest at the top.
# Inside ggplot() the pieces join with +, not the pipe. The chart opens in a VS Code panel.
df %>%
  count(posted_from) %>%
  ggplot(aes(x = fct_reorder(posted_from, n), y = n)) +
  geom_col() +
  coord_flip() +
  labs(
    title = "Where #NoMansSky posts were sent from",
    x = NULL,
    y = "Posts",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  )

# Save the chart to a picture file in your course folder. Prints nothing when a size is given.
ggsave("posted-from-bar.png", width = 7, height = 5)
