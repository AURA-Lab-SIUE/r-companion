# ---- Crosstab: count every pair of channel_type and viewer_band ----
# One row per channel_type value, one column per viewer_band value: first the counts, then the share
# of each channel_type value's rows in each viewer_band value (each row adds up to 1). Rows missing
# either column are dropped first. The first time it runs it prints the count() and
# pivot_wider() lines it stands for.
crosstab(analysis, channel_type, viewer_band)
