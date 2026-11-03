# ---- Crosstab: count every pair of two columns ----
# One row per viewer band, one column per channel type: first the counts, then the share of
# each band's messages in each channel type (each row adds up to 1). Rows missing either
# column are dropped first. The first time it runs it prints the count() and pivot_wider()
# lines it stands for.
crosstab(analysis, viewer_band, channel_type)
