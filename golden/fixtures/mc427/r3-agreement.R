# ---- Agreement: how often sentiment and ai_sentiment match ----
# sentiment == ai_sentiment is TRUE or FALSE for each row; mean() of that is the share TRUE,
# because R counts TRUE as 1 and FALSE as 0. Prints one number between 0 and 1.
codes %>%
  summarize(share_agree = mean(sentiment == ai_sentiment))

# Every pair of codes, with n, how many rows got that pair. The rows where the two codes
# are the same are the agreements.
codes %>%
  count(sentiment, ai_sentiment)

# The rows where the two codes differ (!= means "is not equal to"), with review_id so you can
# find each one.
codes %>%
  filter(sentiment != ai_sentiment) %>%
  select(review_id, sentiment, ai_sentiment)
