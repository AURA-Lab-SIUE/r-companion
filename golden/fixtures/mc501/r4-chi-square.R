# ---- Chi-square test of independence: cat_a by cat_b ----
# The counts in the form the test reads. Name it counts, so the lines below reuse it.
counts <- xtabs(~ cat_a + cat_b, data = analysis)

# The counts the test expected if the two were unrelated. Check that none is below 5.
counts %>%
  chisq.test() %>%
  pluck("expected") %>%
  round(2)

# The test with its effect size. Prints N, chi-square, df, p, and Cramer's V.
run_chi_square(analysis, x = cat_a, y = cat_b)

# Cramer's V with its 95% interval. adjust = FALSE gives the same V that run_chi_square() prints.
effectsize::cramers_v(counts, adjust = FALSE)

# Standardized residuals: cells beyond 2 or -2 are the ones driving the result.
counts %>%
  chisq.test() %>%
  pluck("stdres") %>%
  round(2)
