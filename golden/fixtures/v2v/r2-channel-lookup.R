# ---- Label each channel by the category it streams most ----
# Count each channel's snapshots in each category, then keep its most frequent category.
# Snapshots with no category are dropped first. Prints nothing.
channel_type <- streams %>%
  filter(!is.na(game)) %>%
  count(channel, game) %>%
  group_by(channel) %>%
  slice_max(n, n = 1, with_ties = FALSE) %>%
  ungroup()

# The categories that are not games.
nongaming_categories <- c(
  "Art", "ASMR", "Beauty & Body Art", "Creative", "Food & Drink",
  "IRL", "Just Chatting", "Makers & Crafting", "Music",
  "Music & Performing Arts", "Science & Technology",
  "Sports & Fitness", "Talk Shows & Podcasts", "Travel & Outdoors"
)

# is_gaming is TRUE when a channel's main category is not on that list. main_game keeps the
# category itself, under a name that does not clash with the snapshot's game. Prints nothing.
channel_type <- channel_type %>%
  mutate(is_gaming = !(game %in% nongaming_categories)) %>%
  select(channel, main_game = game, is_gaming)

# One row per channel that has a category.
nrow(channel_type)
