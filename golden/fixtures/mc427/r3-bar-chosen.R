# ---- Bar chart: one bar per value of posted_from ----
# Count the rows for each value of posted_from, keep the 15 biggest (a tie can keep a few more),
# then draw one bar per value, longest at the top. Rows with no value are dropped first.
# as.character() lets a TRUE/FALSE or number column work too. Inside ggplot() the pieces join
# with +, not the pipe.
df %>%
  filter(!is.na(posted_from)) %>%
  count(posted_from) %>%
  slice_max(n, n = 15) %>%
  ggplot(aes(x = fct_reorder(as.character(posted_from), n), y = n)) +
  geom_col() +
  coord_flip() +
  labs(
    title = "YOUR TURN: a title that says what the chart shows",
    x = "YOUR TURN: what the x axis measures",
    y = "YOUR TURN: what the y axis measures",
    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."
  )

# Save the chart to a picture file in your course folder.
ggsave("posted-from-bar.png", width = 7, height = 5)
