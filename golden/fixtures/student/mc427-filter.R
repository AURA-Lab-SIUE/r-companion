# ---- Keep the rows you want: filter() ----
# Keep the posts where platform is "TikTok" and name the result tiktok.
# Text values go in quotation marks. This line prints nothing.
tiktok <- posts %>%
  filter(platform == "TikTok")

# Count the rows that are left.
nrow(tiktok)
