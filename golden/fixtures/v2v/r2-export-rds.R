# ---- Save a table as an RDS file: write_rds() ----
# An RDS file keeps every column type exactly, so the next script loads the same table.
# Prints nothing.
write_rds(analysis, "data/twitch_analysis.RDS")

# Read the saved file back and count its rows, to confirm the save worked.
read_rds("data/twitch_analysis.RDS") %>%
  nrow()
