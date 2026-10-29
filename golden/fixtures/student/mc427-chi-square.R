# ---- Chi-square test: platform by has_caption ----
# Keep the rows that have a value in every column the test uses, so every line below uses
# the same rows. This line prints nothing.
tested <- posts %>%
  filter(!is.na(platform), !is.na(has_caption))

# The observed counts: one row per value of platform, one column per value of has_caption.
tested %>%
  count(platform, has_caption) %>%
  pivot_wider(names_from = has_caption, values_from = n, values_fill = 0)

# The same counts in the form the test reads. Name it counts, so the lines below reuse it.
counts <- xtabs(~ platform + has_caption, data = tested)

# The counts the test expected if the two were unrelated. Check that none is below 5.
counts %>%
  chisq.test() %>%
  pluck("expected") %>%
  round(2)

# The test: X-squared is chi-square, df is its degrees of freedom, and p-value is p.
counts %>%
  chisq.test()

# The number of rows in the table, for the write-up.
sum(counts)

# The effect size: Cramer's V with its 95% confidence interval.
effectsize::cramers_v(counts)
