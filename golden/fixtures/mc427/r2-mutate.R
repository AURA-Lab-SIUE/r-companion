# ---- Add a new column: mutate() ----
# Add log_likes, the log of one plus like_count. log1p() keeps a zero at zero,
# where log() would turn it into -Inf. This line changes df and prints nothing.
df <- df %>%
  mutate(log_likes = log1p(like_count))

# Check the new column beside the one it came from, in the first three rows.
df %>%
  select(like_count, log_likes) %>%
  slice_head(n = 3)
