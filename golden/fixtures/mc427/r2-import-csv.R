# ---- Load the tidyverse and your data file ----
# Load the tidyverse once, at the top of the script. It prints a list of
# packages with check marks and two "masks" lines; both are normal.
library(tidyverse)

# Read the file and name it df. Prints a report: rows, columns, and each column's type.
df <- read_csv("mod05-E01-practice-tweets.csv")

# Look at every column: its name, its type, and its first values.
glimpse(df)
