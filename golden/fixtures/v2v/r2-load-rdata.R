# ---- Load the tidyverse, the course package, and your saved tables ----
library(tidyverse)
library(v2v)

# Print big numbers in full (20000000, not 2e+07) for the rest of this session. Very small
# p-values still print the usual way (< 2e-16), so test results look like the course pages.
options(scipen = 10)

# Read every table in the file back under the name it was saved with. A table you already
# have with the same name is replaced. verbose = TRUE prints the names that came back.
load("data/my-tables.RData", verbose = TRUE)
