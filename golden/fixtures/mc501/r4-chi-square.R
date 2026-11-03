# ---- Chi-square test of independence: cat_a by cat_b ----
# N, chi-square, df, p, and Cramer's V, then the expected counts (each should be at least 5)
# and the standardized residuals (beyond 2 or -2 drives the result). The block ends with the
# chisq.test() and effectsize::cramers_v() lines it stands for.
run_chi_square(analysis, x = cat_a, y = cat_b)
