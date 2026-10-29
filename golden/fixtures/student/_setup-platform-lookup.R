# Runner preamble, not generated: a second table a student brings for a join, one row per
# platform with the company that owns it. "X" is left out on purpose, so the join's no-match
# check has something to count.
library(tidyverse)
platform_info <- tibble(
  platform = c("Instagram", "TikTok", "YouTube"),
  owner_company = c("Meta", "ByteDance", "Google")
)
