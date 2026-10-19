# ---- Reliability: compare your two coding passes ----
# The share of items where pass 1 and pass 2 gave the same code.
pilot %>%
  summarize(
    items = n(),
    share_agree = mean(pass_1 == pass_2)
  )

# Every pair of codes, and how many items got it. The n column adds up to the items.
pilot %>%
  count(pass_1, pass_2)

# Cohen's kappa, from the irr package: give it the two code columns.
pilot %>%
  select(pass_1, pass_2) %>%
  irr::kappa2()

# Every code either pass used, in one list, so both passes number the codes the same way.
codes <- pilot %>%
  pivot_longer(c(pass_1, pass_2), values_to = "code") %>%
  distinct(code) %>%
  pull(code)

# Krippendorff's alpha: irr wants numbers and one row per pass, so number the codes, then
# turn the two columns on their side.
pilot %>%
  mutate(across(c(pass_1, pass_2), ~ as.integer(factor(.x, levels = codes)))) %>%
  select(pass_1, pass_2) %>%
  t() %>%
  irr::kripp.alpha(method = "nominal")

# Check: the v2v wrapper prints the same kappa.
reliability(
  pull(pilot, pass_1),
  pull(pilot, pass_2),
  method = "kappa"
)
