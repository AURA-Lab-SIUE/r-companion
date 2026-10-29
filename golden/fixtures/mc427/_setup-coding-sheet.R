# Runner preamble, not generated: a coding sheet like MC 427 Module 4's (50 reviews, your codes in
# focus and sentiment, the AI's in ai_focus and ai_sentiment), filled with codes drawn at random
# with a fixed seed, as DT03's own example is. It is nobody's real coding.
library(tidyverse)
set.seed(427)
codes <- tibble(
  review_id = sprintf("R%02d", 1:50),
  focus = sample(c("F-1", "F-2", "F-3"), 50, replace = TRUE),
  sentiment = sample(c("S-1", "S-2", "S-3"), 50, replace = TRUE)
) %>%
  mutate(
    ai_focus = if_else(runif(50) < 0.8, focus, "F-1"),
    ai_sentiment = if_else(runif(50) < 0.9, sentiment, "S-2")
  )
