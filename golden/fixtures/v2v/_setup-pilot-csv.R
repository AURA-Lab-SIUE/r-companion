# Runner preamble, not generated: a stand-in for the CSV the reliability grid saves.
# Twenty real messages from the course corpus, coded twice by two written rules under one
# label, the "two rules under one name" failure in the MC 451 s20 deck. The codes come from
# the rules, not from any person, so the file holds no student work.
dir.create("data", showWarnings = FALSE)
library(tidyverse)
library(v2v)

pilot_grid <- twitch_chat() %>%
  filter(!is.na(message)) %>%
  sample_messages(n_per_channel = 1, seed = 409) %>%
  slice_head(n = 20) %>%
  transmute(
    item_id = row_number(),
    message,
    pass_1 = if_else(str_detect(message, "Kappa|Pog|LUL|KEKW|monka|PJSalt|Kreygasm"),
                     "high-energy", "calm"),
    pass_2 = if_else(str_detect(message, "[A-Z]{3}") & message == str_to_upper(message),
                     "high-energy", "calm")
  )

write_csv(pilot_grid, "data/reliability-pilot.csv")
rm(list = ls())
