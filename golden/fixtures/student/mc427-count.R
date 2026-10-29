# ---- Count the rows in each group: count() ----
# One row per value of platform, largest first. The n column adds up to the rows in posts.
posts %>%
  count(platform, sort = TRUE)
