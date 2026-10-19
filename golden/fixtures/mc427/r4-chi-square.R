# ---- Chi-square test: update by posted_from ----
# The observed counts: one row per update, one column per app.
df %>%
  count(update, posted_from) %>%
  pivot_wider(names_from = posted_from, values_from = n, values_fill = 0)

# The same counts in the form the test reads. Name it counts, so the lines below reuse it.
counts <- xtabs(~ update + posted_from, data = df)

# The counts the test expected if the two were unrelated. Check that none is below 5.
counts %>%
  chisq.test() %>%
  pluck("expected") %>%
  round(2)

# The test: X-squared is chi-square, df is its degrees of freedom, and p-value is p.
# This printout keeps two decimals; a tidied table would round 10.03 to 10.0.
counts %>%
  chisq.test()

# The number of posts in the table, for the write-up.
sum(counts)

# The effect size: Cramer's V with its 95% confidence interval.
effectsize::cramers_v(counts)
