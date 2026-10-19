# Runner preamble, not generated: data/twitch_analysis.RDS as the R2 Data menu builds it for
# MC 451 and MC 501. The v2v helpers convert the time and match each message to its stream
# snapshot (owner, q-20261018-0037 = B); the channel labels come from plain dplyr (owner rule,
# q-20261018-0041), which keeps the channel-level is_gaming the Wrangling rubric names.
dir.create("data", showWarnings = FALSE)
library(tidyverse)
library(v2v)

chat <- twitch_chat() %>%
  mutate(
    ts = clean_dates(date),
    message_length = str_length(message)
  )
streams <- twitch_streams() %>%
  mutate(ts = clean_dates(date))

nongaming_categories <- c(
  "Art", "ASMR", "Beauty & Body Art", "Creative", "Food & Drink",
  "IRL", "Just Chatting", "Makers & Crafting", "Music",
  "Music & Performing Arts", "Science & Technology",
  "Sports & Fitness", "Talk Shows & Podcasts", "Travel & Outdoors"
)

channel_type <- streams %>%
  filter(!is.na(game)) %>%
  count(channel, game) %>%
  group_by(channel) %>%
  slice_max(n, n = 1, with_ties = FALSE) %>%
  ungroup() %>%
  mutate(is_gaming = !(game %in% nongaming_categories)) %>%
  select(channel, main_game = game, is_gaming)

channel_size <- streams %>%
  group_by(channel) %>%
  summarize(median_viewers = median(viewers, na.rm = TRUE)) %>%
  mutate(viewer_band = cut(median_viewers, breaks = c(0, 5000, 20000, Inf),
                           labels = c("small", "medium", "large")))

analysis <- join_chat_streams(chat, streams) %>%
  rename(ts = ts.x, snapshot_ts = ts.y) %>%
  left_join(channel_type, by = "channel") %>%
  left_join(channel_size, by = "channel") %>%
  mutate(channel_type = factor(if_else(is_gaming, "gaming", "non-gaming")))

write_rds(analysis, "data/twitch_analysis.RDS")
rm(list = ls())
