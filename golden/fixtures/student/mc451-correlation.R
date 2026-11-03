# ---- Correlation: predictor and outcome ----
# Pearson's r (cor at the bottom), with t, the df, p, and the 95 percent confidence interval.
cor.test(~ predictor + outcome, data = analysis)
