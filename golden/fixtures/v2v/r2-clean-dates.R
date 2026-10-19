# ---- Turn the date column into a readable time: clean_dates() ----
# date counts milliseconds since midnight, January 1, 1970 (UTC). clean_dates() divides by
# 1,000 and turns the result into a date and time. The same step without v2v:
# mutate(ts = as_datetime(date / 1000)), with as_datetime() from lubridate (in the tidyverse).
# These lines change chat and streams and print nothing.
chat <- chat %>%
  mutate(ts = clean_dates(date))
streams <- streams %>%
  mutate(ts = clean_dates(date))

# Check the new column beside the one it came from, in the first three rows.
chat %>%
  select(date, ts) %>%
  slice_head(n = 3)
