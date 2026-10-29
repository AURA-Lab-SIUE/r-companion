# ---- Keep the rows you want: filter() ----
# Keep the rows where has_caption is TRUE and name the result captioned.
# TRUE, FALSE, and numbers go without quotation marks. This line prints nothing.
captioned <- posts %>%
  filter(has_caption == TRUE)

# Count the rows that are left.
nrow(captioned)
