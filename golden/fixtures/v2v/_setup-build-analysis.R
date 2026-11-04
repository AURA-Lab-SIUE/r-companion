# Runner preamble, not generated: data/twitch_analysis.RDS as the R2 Data menu builds it for
# MC 451 and MC 501. Plain lubridate converts the time and plain dplyr matches each message to
# its stream snapshot (owner 2026-11-04: no v2v helper in generated code); the channel labels
# come from plain dplyr too (q-20261018-0041), which keeps the channel-level is_gaming the
# Wrangling rubric names.
dir.create("data", showWarnings = FALSE)
library(tidyverse)
library(v2v)

chat <- twitch_chat() %>%
  mutate(
    ts = as_datetime(date / 1000),
    message_length = str_length(message)
  )
streams <- twitch_streams() %>%
  mutate(ts = as_datetime(date / 1000))

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

snapshots <- streams %>%
  select(channel, snapshot_ts = ts, game, viewers)

analysis <- chat %>%
  left_join(snapshots, by = join_by(channel, closest(ts >= snapshot_ts))) %>%
  left_join(channel_type, by = "channel") %>%
  left_join(channel_size, by = "channel") %>%
  mutate(channel_type = factor(if_else(is_gaming, "gaming", "non-gaming")))

write_rds(analysis, "data/twitch_analysis.RDS")
rm(list = ls())
