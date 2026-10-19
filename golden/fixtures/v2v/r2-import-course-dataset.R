# ---- Load the tidyverse, the course package, and the course data ----
# Load both packages once, at the top of the script.
library(tidyverse)
library(v2v)

# The course corpus: one row per chat message, and one row per stream snapshot.
# These lines print nothing.
chat <- twitch_chat()
streams <- twitch_streams()

# Look at every column of each: its name, its type, and its first values.
glimpse(chat)
glimpse(streams)
