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

# Eta squared from the sums of squares: the group3 row's sumsq divided by the total.
fit %>%
  broom::tidy() %>%
  mutate(eta_sq = sumsq / sum(sumsq))

# The n: the rows the model used.
fit %>%
  broom::glance() %>%
  select(nobs)
