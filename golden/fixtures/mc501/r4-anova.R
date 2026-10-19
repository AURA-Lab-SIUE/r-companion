# ---- One-way ANOVA: outcome by group3 ----
# The size, mean, and standard deviation of each group.
analysis %>%
  filter(!is.na(outcome), !is.na(group3)) %>%
  group_by(group3) %>%
  summarize(
    n = n(),
    mean = mean(outcome),
    sd = sd(outcome)
  )

# Fit the model and name it fit, so the lines below reuse it. Prints nothing.
fit <- aov(outcome ~ group3, data = analysis)

# The ANOVA table: F value, its two df (group3 and Residuals), and Pr(>F), the p-value.
summary(fit)

# Welch's ANOVA, which does not assume the groups spread out equally.
oneway.test(outcome ~ group3, data = analysis)

# Eta squared and omega squared, each with its 95% interval.
effectsize::eta_squared(fit)
effectsize::omega_squared(fit)

# The n: the rows the model used.
fit %>%
  broom::glance() %>%
  select(nobs)

# Which pairs of groups differ: Tukey's follow-up test, one row per pair.
TukeyHSD(fit) %>%
  broom::tidy()
