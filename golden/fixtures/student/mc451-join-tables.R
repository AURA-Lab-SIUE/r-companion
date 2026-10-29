# ---- Join two tables by a shared column: left_join() ----
# Keep every row of posts and add the columns of platform_info whose platform matches. A row
# whose platform is not in platform_info gets NA in the new columns. posts itself does not
# change: the result is a new table named posts_platform_info. Prints nothing.
posts_platform_info <- posts %>%
  left_join(platform_info, by = join_by(platform))

# Check the join two ways: the row count should equal the rows in posts (a bigger number means
# platform repeats in platform_info), and the second count says how many rows found no match.
nrow(posts_platform_info)
posts %>%
  anti_join(platform_info, by = join_by(platform)) %>%
  nrow()
