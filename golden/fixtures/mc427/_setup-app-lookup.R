# Runner preamble, not generated: a small lookup table for the MC 427 join fixture, one row per
# app a post was sent from, with a console flag made from the app's own name. It stands in for the
# second table a student brings (a codebook, a list of accounts, a list of videos).
library(tidyverse)

df <- read_csv("mod05-E01-practice-tweets.csv", show_col_types = FALSE)
apps <- df %>%
  distinct(posted_from) %>%
  mutate(is_console = str_detect(posted_from, "share button"))
rm(df)
