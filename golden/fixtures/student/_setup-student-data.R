# Runner preamble, not generated: a student's own data file, made with a fixed seed so every run
# makes the same file. Its columns differ from the course data in name and in type on purpose:
# a text id, a date-time, a date, whole numbers, decimals with gaps, TRUE/FALSE, codes with
# blanks, and a name with a space in it, as a CSV saved from a spreadsheet can have. It is
# written twice, once at the top of the folder (MC 427) and once in data/ (MC 451 and MC 501).
library(tidyverse)
set.seed(2026)
n <- 240
my_posts <- tibble(
  post_id = sprintf("P%03d", 1:n),
  platform = sample(c("Instagram", "TikTok", "YouTube", "X"), n, replace = TRUE),
  posted_at = as.POSIXct("2026-09-01 08:00:00", tz = "UTC") + sample(0:(60 * 60 * 24 * 14), n),
  post_day = as.Date("2026-09-01") + sample(0:13, n, replace = TRUE),
  views = sample(50:5000, n, replace = TRUE),
  watch_minutes = if_else(runif(n) < 0.1, NA_real_, round(rexp(n, 1 / 3), 2)),
  has_caption = runif(n) < 0.6,
  tone_code = if_else(runif(n) < 0.15, NA_character_, sample(c("T-1", "T-2", "T-3"), n, replace = TRUE)),
  `Follower Count` = round(rlnorm(n, 7, 1))
) %>%
  mutate(tone_code_ai = if_else(runif(n) < 0.8, tone_code, "T-2"))
dir.create("data", showWarnings = FALSE)
write_csv(my_posts, "my-posts.csv")
write_csv(my_posts, "data/my-posts.csv")
rm(my_posts, n)
