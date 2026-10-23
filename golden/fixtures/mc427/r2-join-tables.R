# ---- Join two tables by a shared column: left_join() ----
# Keep every row of df and add the columns of apps whose posted_from matches. A row whose
# posted_from is not in apps gets NA in the new columns. df itself does not change: the result
# is a new table named df_apps. Prints nothing.
df_apps <- df %>%
  left_join(apps, by = join_by(posted_from))

# Check the join two ways: the row count should equal the rows in df (a bigger number means
# posted_from repeats in apps), and the second count says how many rows found no match.
nrow(df_apps)
df %>%
  anti_join(apps, by = join_by(posted_from)) %>%
  nrow()
