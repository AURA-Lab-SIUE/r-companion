# ---- Label each channel by the category it streams most ----
# The course package ships a lookup table: one row per channel, with main_game (the category
# it streamed most often), is_gaming, channel_type, median_viewers, and viewer_band.
# Run ?twitch_channels to read the non-gaming list and the audience cutoffs. Prints nothing.
channels <- twitch_channels()

# Count the channels: gaming (TRUE), non-gaming (FALSE), and no category recorded (NA).
channels %>%
  count(is_gaming)
