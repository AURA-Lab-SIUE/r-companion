# ---- Chi-square test of independence: cat_a by cat_b ----
# The counts the test expected if the two were unrelated. Check that none is below 5.
xtabs(~ cat_a + cat_b, data = analysis) %>%
  chisq.test() %>%
  pluck("expected") %>%
  round(2)

# The test with its effect size. Prints N, chi-square, df, p, and Cramer's V.
run_chi_square(analysis, x = cat_a, y = cat_b)
