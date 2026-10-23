# ---- Load the tidyverse, the course package, and the course data ----
# Load both packages once, at the top of the script.
library(tidyverse)
library(v2v)

# Print big numbers in full (20000000, not 2e+07) for the rest of this session. Very small
# p-values still print the usual way (< 2e-16), so test results look like the course pages.
options(scipen = 10)

# The course corpus: one row per chat message, and one row per stream snapshot.
# These lines print nothing.
chat <- twitch_chat()
streams <- twitch_streams()

# Look at every column of each: its name, its type, and its first values.
glimpse(chat)
glimpse(streams)
