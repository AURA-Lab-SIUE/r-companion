# ---- Load the tidyverse, the course package, and a CSV file ----
library(tidyverse)
library(v2v)

# Read the file and name it pilot. Prints a report: rows, columns, and each column's type.
pilot <- read_csv("data/reliability-pilot.csv")

# Look at every column: its name, its type, and its first values.
glimpse(pilot)
