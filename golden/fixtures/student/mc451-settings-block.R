# ---- Settings block: load the data and name the variables the tests use ----
# To run this script on other data, change only this block.
library(tidyverse)
library(v2v)

# Load the analysis file, then keep the columns the tests use under the names they use.
# outcome is a number; group2 has two groups; group3 has three or more; predictor is a
# number; cat_a and cat_b are categories. factor() makes a column a category.
analysis <- read_rds("data/my-posts.RDS") %>%
  transmute(
    outcome = views,
    group2 = factor(has_caption),
    group3 = factor(platform),
    predictor = watch_minutes,
    cat_a = factor(platform),
    cat_b = factor(tone_code)
  )

# Check the names and types.
glimpse(analysis)
