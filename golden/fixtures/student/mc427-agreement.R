# ---- Agreement: how often tone_code and tone_code_ai match ----
# tone_code == tone_code_ai is TRUE or FALSE for each row; mean() of that is the share TRUE,
# because R counts TRUE as 1 and FALSE as 0. Prints one number between 0 and 1.
posts %>%
  summarize(share_agree = mean(tone_code == tone_code_ai))

# Every pair of codes, with n, how many rows got that pair. The rows where the two codes
# are the same are the agreements.
posts %>%
  count(tone_code, tone_code_ai)

# The rows where the two codes differ (!= means "is not equal to"), with post_id so you can
# find each one.
posts %>%
  filter(tone_code != tone_code_ai) %>%
  select(post_id, tone_code, tone_code_ai)
