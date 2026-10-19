# ---- Chi-square test: cat_a by cat_b, with the functions run_chi_square() wraps ----
# PROPOSED for the stepping-stone audit; not a course dialect.
counts <- xtabs(~ cat_a + cat_b, data = analysis)

# The test, as a one-row table: statistic is chi-square, parameter is the df, p.value is p.
counts %>%
  chisq.test() %>%
  broom::tidy()

# Cramer's V without the small-sample adjustment, the number run_chi_square() prints.
effectsize::cramers_v(counts, adjust = FALSE)
