# ---- Save a table as a CSV file: write_csv() ----
# Save next_posts to a file in your course folder. Prints nothing.
write_csv(next_posts, "next-posts.csv")

# Read the saved file back and count its rows, to confirm the save worked.
read_csv("next-posts.csv") %>%
  nrow()
