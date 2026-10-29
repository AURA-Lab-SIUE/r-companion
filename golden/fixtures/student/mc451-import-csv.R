# ---- Load the tidyverse, the course package, and a CSV file ----
library(tidyverse)
library(v2v)

# Print big numbers in full (20000000, not 2e+07) for the rest of this session. Very small
# p-values still print the usual way (< 2e-16), so test results look like the course pages.
options(scipen = 10)

# Read the file and name it posts. Prints a report: rows, columns, and each column's type.
# clean_names() then rewrites the column names in lower case with underscores (Pass 1 becomes
# pass_1), so you can type them without backticks.
posts <- read_csv("data/my-posts.csv") %>%
  janitor::clean_names()

# Look at every column: its name, its type, and its first values.
glimpse(posts)
