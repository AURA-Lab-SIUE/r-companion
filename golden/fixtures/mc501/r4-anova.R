# ---- One-way ANOVA: outcome by group3 ----
# Each group with its n, mean, and SD, then F, both df, p, eta squared, omega squared, Welch's
# ANOVA (which does not assume equal spread), and Tukey's follow-up for every pair of groups.
# The block ends with the aov(), effectsize::eta_squared(), and TukeyHSD() lines it stands for.
run_anova(analysis, value = outcome, group = group3)
