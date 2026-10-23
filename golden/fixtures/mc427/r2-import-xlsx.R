# ---- Load the tidyverse and your data file ----
# Load the tidyverse once, at the top of the script. It prints a list of
# packages with check marks and two "masks" lines; both are normal.
library(tidyverse)

# Print big numbers in full (20000000, not 2e+07) for the rest of this session. Very small
# p-values still print the usual way (< 2e-16), so test results look like the course pages.
options(scipen = 10)

# Read the Excel sheet and name it df. readxl comes with the tidyverse but is not
# loaded by library(tidyverse), so it is named in full. Prints nothing.
df <- readxl::read_excel("coded-pilot.xlsx", sheet = "Sheet1")

# Look at every column: its name, its type, and its first values.
glimpse(df)
