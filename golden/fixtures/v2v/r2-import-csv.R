# ---- Load the tidyverse, the course package, and a CSV file ----
library(tidyverse)
library(v2v)

# Print big numbers in full (20000000, not 2e+07) for the rest of this session. Very small
# p-values still print the usual way (< 2e-16), so test results look like the course pages.
options(scipen = 10)

# Read the file and name it pilot. Prints a report: rows, columns, and each column's type.
pilot <- read_csv("data/reliability-pilot.csv")

# Look at every column: its name, its type, and its first values.
glimpse(pilot)
