# ---- Save a table as a CSV file: write_csv() ----
# Save posts to a file in your course folder. Prints nothing.
write_csv(posts, "my-posts-out.csv")

# Read the saved file back and count its rows, to confirm the save worked.
read_csv("my-posts-out.csv") %>%
  nrow()
