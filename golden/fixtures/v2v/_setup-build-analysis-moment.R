# Runner preamble, not generated: the per-moment alternative, labels taken from the stream
# snapshot nearest before each message. Used only to show how every result moves under it.
dir.create("data", showWarnings = FALSE)
library(tidyverse)
library(v2v)

nongaming_categories <- c(
  "Art", "ASMR", "Beauty & Body Art", "Creative", "Food & Drink",
  "IRL", "Just Chatting", "Makers & Crafting", "Music",
  "Music & Performing Arts", "Science & Technology",
  "Sports & Fitness", "Talk Shows & Podcasts", "Travel & Outdoors"
)

chat <- twitch_chat() %>%
  mutate(
    ts = clean_dates(date),
    message_length = str_length(message)
  )
streams <- twitch_streams() %>%
  mutate(ts = clean_dates(date))

analysis <- join_chat_streams(chat, streams) %>%
  mutate(
    is_gaming = if_else(is.na(game), NA, !(game %in% nongaming_categories)),
    channel_type = factor(if_else(is_gaming, "gaming", "non-gaming")),
    viewer_band = cut(viewers, breaks = c(0, 5000, 20000, Inf),
                      labels = c("small", "medium", "large"))
  )

write_rds(analysis, "data/twitch_analysis.RDS")
rm(list = ls())
