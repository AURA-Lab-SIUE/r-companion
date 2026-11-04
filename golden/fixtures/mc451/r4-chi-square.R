# ---- Chi-square test of independence: cat_a by cat_b ----
# The observed counts in the form the test reads: one row per value of cat_a, one column
# per value of cat_b. Name it counts, so the lines below reuse it.
counts <- xtabs(~ cat_a + cat_b, data = analysis)

# N, the number of messages the test used.
sum(counts)

# The test, named chi so the lines below reuse it. X-squared is chi-square, df is its degrees
# of freedom, and p-value is p.
chi <- chisq.test(counts)
chi

# The effect size: Cramer's V with its 95% confidence interval. Below 0.1 is negligible, 0.1
# small, 0.3 medium, and 0.5 or more large.
cramers_v(counts, adjust = FALSE)
