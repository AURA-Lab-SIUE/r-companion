# ---- Load the tidyverse, the course package, and your saved analysis file ----
library(tidyverse)
library(v2v)

# Read the RDS file you saved in the wrangling step and name it analysis. Prints nothing.
analysis <- read_rds("data/twitch_analysis.RDS")

# Look at every column: its name, its type, and its first values.
glimpse(analysis)
