# ---- Save a table as a CSV file: write_csv() ----
# Save gaming to a file in your data folder. Prints nothing.
write_csv(gaming, "data/gaming-messages.csv")

# Read the saved file back and count its rows, to confirm the save worked.
read_csv("data/gaming-messages.csv") %>%
  nrow()
