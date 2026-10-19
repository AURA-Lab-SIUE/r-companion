# ---- Keep the rows you want: filter() ----
# Keep the posts where update is "NEXT" and name the result next_posts.
# Text values go in quotation marks. This line prints nothing.
next_posts <- df %>%
  filter(update == "NEXT")

# Count the rows that are left.
nrow(next_posts)
