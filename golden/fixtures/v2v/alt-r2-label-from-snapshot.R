# ---- Label each message from its stream snapshot ----
# The categories that are not games.
nongaming_categories <- c(
  "Art", "ASMR", "Beauty & Body Art", "Creative", "Food & Drink",
  "IRL", "Just Chatting", "Makers & Crafting", "Music",
  "Music & Performing Arts", "Science & Technology",
  "Sports & Fitness", "Talk Shows & Podcasts", "Travel & Outdoors"
)

# The per-moment alternative: is_gaming is TRUE when the stream's category AT THAT MOMENT is a
# game, NA when none was recorded, and viewer_band is that moment's audience in three bands.
# It answers a different question from the channel label, and changes every later result.
# Changes chat_streams; prints nothing.
chat_streams <- chat_streams %>%
  mutate(
    is_gaming = if_else(is.na(game), NA, !(game %in% nongaming_categories)),
    channel_type = factor(if_else(is_gaming, "gaming", "non-gaming")),
    viewer_band = cut(viewers, breaks = c(0, 5000, 20000, Inf),
                      labels = c("small", "medium", "large"))
  )

# Check the labels: gaming (TRUE), not gaming (FALSE), and unlabeled (NA).
chat_streams %>%
  count(is_gaming)

# And the bands.
chat_streams %>%
  count(viewer_band)
