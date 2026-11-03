# ---- Crosstab: count every pair of platform and tone_code ----
# One row per platform value, one column per tone_code value: first the counts, then the share
# of each platform value's rows in each tone_code value (each row adds up to 1). Rows missing
# either column are dropped first. The first time it runs it prints the count() and
# pivot_wider() lines it stands for.
crosstab(posts, platform, tone_code)
