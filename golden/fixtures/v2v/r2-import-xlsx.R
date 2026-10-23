# ---- Load the tidyverse, the course package, and your data file ----
library(tidyverse)
library(v2v)

# Print big numbers in full (20000000, not 2e+07) for the rest of this session. Very small
# p-values still print the usual way (< 2e-16), so test results look like the course pages.
options(scipen = 10)

# Read the Excel sheet and name it coded_pilot. readxl comes with the tidyverse but is not
# loaded by library(tidyverse), so it is named in full. Prints nothing.
coded_pilot <- readxl::read_excel("data/coded-pilot.xlsx", sheet = "Sheet1")

# Look at every column: its name, its type, and its first values.
glimpse(coded_pilot)
