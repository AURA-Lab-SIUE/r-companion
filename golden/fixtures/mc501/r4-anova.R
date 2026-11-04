# ---- One-way ANOVA: outcome by group3 ----
# The size, mean, and standard deviation of each group. Rows missing either column are
# dropped first, so n matches the rows the test uses.
analysis %>%
  filter(!is.na(outcome), !is.na(group3)) %>%
  group_by(group3) %>%
  summarize(n = n(), mean = mean(outcome), sd = sd(outcome))

# Fit the model and name it fit_anova, so the lines below reuse it. Prints nothing.
fit_anova <- aov(outcome ~ group3, data = analysis)

# The test as a table: the group3 row holds F (F value), its df, and p (Pr(>F)); the
# Residuals row holds the second df.
summary(fit_anova)

# The effect size: eta squared, the share of the variation the groups explain. Below 0.01
# is negligible, 0.01 small, 0.06 medium, and 0.14 or more large.
eta_squared(fit_anova)

# Welch's ANOVA, which does not assume the groups have the same spread.
oneway.test(outcome ~ group3, data = analysis)

# Omega squared, a less biased estimate of the same share.
omega_squared(fit_anova)

# Which pairs of groups differ: Tukey's follow-up test, one row per pair, with an
# adjusted p (p adj) for each.
TukeyHSD(fit_anova)
