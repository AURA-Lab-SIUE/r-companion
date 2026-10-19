# ---- Reliability with the functions reliability() wraps ----
# PROPOSED for the stepping-stone audit; not a course dialect.
# Cohen's kappa, from the irr package: give it the two code columns.
pilot %>%
  select(pass_1, pass_2) %>%
  irr::kappa2()

# Krippendorff's alpha: irr wants one row per pass and numbers, so turn the two columns on
# their side and number the codes first.
pilot %>%
  mutate(across(c(pass_1, pass_2), ~ as.integer(factor(.x, levels = c("calm", "high-energy"))))) %>%
  select(pass_1, pass_2) %>%
  t() %>%
  irr::kripp.alpha(method = "nominal")
