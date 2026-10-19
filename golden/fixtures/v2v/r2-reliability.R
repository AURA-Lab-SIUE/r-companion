# ---- Reliability: compare your two coding passes ----
# The share of items where pass 1 and pass 2 gave the same code.
pilot %>%
  summarize(
    items = n(),
    share_agree = mean(pass_1 == pass_2)
  )

# Every pair of codes, and how many items got it. The n column adds up to the items.
pilot %>%
  count(pass_1, pass_2)

# Cohen's kappa: agreement after removing the agreement chance alone would produce.
# Prints a list: statistic, method, interpretation, and raw.
reliability(
  pull(pilot, pass_1),
  pull(pilot, pass_2),
  method = "kappa"
)

# Krippendorff's alpha on the same two passes.
reliability(
  pull(pilot, pass_1),
  pull(pilot, pass_2),
  method = "alpha"
)
