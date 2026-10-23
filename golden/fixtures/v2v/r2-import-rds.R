# ---- Load the tidyverse, the course package, and your saved analysis file ----
library(tidyverse)
library(v2v)

# Print big numbers in full (20000000, not 2e+07) for the rest of this session. Very small
# p-values still print the usual way (< 2e-16), so test results look like the course pages.
options(scipen = 10)

# Read the RDS file you saved in the wrangling step and name it analysis. Prints nothing.
analysis <- read_rds("data/twitch_analysis.RDS")

# Look at every column: its name, its type, and its first values.
glimpse(analysis)
