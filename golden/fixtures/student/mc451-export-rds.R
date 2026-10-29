# ---- Save a table as an RDS file: write_rds() ----
# An RDS file keeps every column type exactly, so the next script loads the same table.
# Prints nothing.
write_rds(posts, "data/my-posts.RDS")

# Read the saved file back and count its rows, to confirm the save worked.
read_rds("data/my-posts.RDS") %>%
  nrow()
