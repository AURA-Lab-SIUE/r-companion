# ---- Draw your coding sample, with a seed ----
# A random sample from posts: 10 rows from each platform, named coding_sample. The seed (77)
# makes the draw repeatable: run these lines again and you get the same rows. Write the seed in
# your sampling plan. Prints nothing.
set.seed(77)
coding_sample <- posts %>%
  group_by(platform) %>%
  slice_sample(n = 10) %>%
  ungroup()

# How many rows came from each platform.
coding_sample %>%
  count(platform)

# Save the sample as a CSV file. This is the file you open in the data viewer to code. Prints
# nothing.
dir.create("data", showWarnings = FALSE)   # makes the data folder if it is not there yet
write_csv(coding_sample, "data/posts-sample.csv")
