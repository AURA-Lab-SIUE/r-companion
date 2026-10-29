# ---- Draw your coding sample, with a seed ----
# A random sample from chat: 100 rows, named coding_sample. The seed (2026) makes the draw
# repeatable: run these lines again and you get the same rows. Write the seed in your sampling
# plan. Prints nothing.
set.seed(2026)
coding_sample <- chat %>%
  slice_sample(n = 100)

# How many rows the sample has.
nrow(coding_sample)

# Save the sample as a CSV file. This is the file you open in the data viewer to code. Prints
# nothing.
dir.create("data", showWarnings = FALSE)   # makes the data folder if it is not there yet
write_csv(coding_sample, "data/coding-sample.csv")
