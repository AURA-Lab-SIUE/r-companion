# ---- Turn the date column into a readable time ----
# date counts milliseconds since midnight, January 1, 1970 (UTC). Divide by 1,000 to get
# seconds, then as.POSIXct() turns the seconds into a date and time. Changes chat; prints nothing.
chat <- chat %>%
  mutate(timestamp = as.POSIXct(date / 1000, origin = "1970-01-01", tz = "UTC"))

# Check the new column beside the one it came from, in the first three rows.
chat %>%
  select(date, timestamp) %>%
  slice_head(n = 3)
