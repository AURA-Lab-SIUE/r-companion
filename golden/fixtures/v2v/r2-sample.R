# ---- Draw your coding sample, with a seed ----
# A random sample from chat: 30 rows from each channel, named coding_sample. The seed (409)
# makes the draw repeatable: run these lines again and you get the same rows. Write the seed in
# your sampling plan. Prints nothing.
# sample_messages() sets the seed, then groups by channel and draws with slice_sample().
coding_sample <- sample_messages(chat, n_per_channel = 30, seed = 409)

# How many rows came from each channel.
coding_sample %>%
  count(channel)

# Save the sample as a CSV file. This is the file you open in the data viewer to code. Prints
# nothing.
dir.create("data", showWarnings = FALSE)   # makes the data folder if it is not there yet
write_csv(coding_sample, "data/coding-sample.csv")
