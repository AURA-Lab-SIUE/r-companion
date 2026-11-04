# ---- Turn the date column into a readable time: as_datetime() ----
# date counts milliseconds since midnight, January 1, 1970 (UTC). as_datetime(), from
# lubridate (loaded with the tidyverse), expects seconds, so divide by 1,000 first. It
# stores the result as a date and time in a new column, ts. On your own data, a date
# written as text uses the reader that matches it: ymd_hms() for 2024-03-01 14:22:05,
# mdy() for 3/1/2024. These lines change chat and streams and print nothing.
chat <- chat %>%
  mutate(ts = as_datetime(date / 1000))
streams <- streams %>%
  mutate(ts = as_datetime(date / 1000))

# Check the new column beside the one it came from, in the first three rows.
chat %>%
  select(date, ts) %>%
  slice_head(n = 3)
