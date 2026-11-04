# ---- Linear regression: outcome predicted by predictor ----
# Fit the line and name it fit_lm, so the lines below reuse it. lm() leaves out a row
# missing either column by itself. Prints nothing.
fit_lm <- lm(outcome ~ predictor, data = analysis)

# Everything the write-up needs: in the Coefficients table, the predictor row holds the
# slope (Estimate) and its p (Pr(>|t|)); below it, Multiple R-squared is the share of the
# variation explained, and the last line holds F, its two df, and p.
summary(fit_lm)
