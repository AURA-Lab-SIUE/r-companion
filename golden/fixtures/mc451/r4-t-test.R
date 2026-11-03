# ---- Welch t-test: outcome by group2 ----
# Both groups with their n, mean, and SD, then the gap, t, df, p, and Cohen's d. The block ends
# with the t.test() and effectsize::cohens_d() lines it stands for.
run_t_test(analysis, value = outcome, group = group2)
