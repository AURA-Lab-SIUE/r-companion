# Runner preamble, not generated: workbook chapter 4's closing chunk, verbatim (the hand
# conversion and the per-channel lookup). Used only to compare old and new checkpoint counts.
dir.create("data", showWarnings = FALSE)
library(tidyverse)
library(v2v)

chat <- twitch_chat()
streams <- twitch_streams()

nongaming_categories <- c(
  "Art", "ASMR", "Beauty & Body Art", "Creative", "Food & Drink",
  "IRL", "Just Chatting", "Makers & Crafting", "Music",
  "Music & Performing Arts", "Science & Technology",
  "Sports & Fitness", "Talk Shows & Podcasts", "Travel & Outdoors"
)

channel_type <- streams %>%                         # what each channel mostly streams
  filter(!is.na(game)) %>%
  count(channel, game) %>%
  group_by(channel) %>%
  slice_max(n, n = 1, with_ties = FALSE) %>%
  ungroup() %>%
  mutate(is_gaming = !(game %in% nongaming_categories)) %>%
  select(channel, game, is_gaming)

channel_size <- streams %>%                          # how big each channel's audience is
  group_by(channel) %>%
  summarize(median_viewers = median(viewers, na.rm = TRUE)) %>%
  mutate(viewer_band = cut(median_viewers, breaks = c(0, 5000, 20000, Inf),
                           labels = c("small", "medium", "large"))) %>%
  select(channel, viewer_band)

analysis <- chat %>%
  mutate(
    timestamp      = as.POSIXct(date / 1000, origin = "1970-01-01", tz = "UTC"),
    message_length = str_length(message)
  ) %>%
  left_join(channel_type, by = "channel") %>%
  left_join(channel_size, by = "channel") %>%
  mutate(
    channel_type = factor(if_else(is_gaming, "gaming", "non-gaming")),
    viewer_band  = factor(viewer_band, levels = c("small", "medium", "large"))
  )

saveRDS(analysis, "data/twitch_analysis.RDS")
rm(list = ls())
