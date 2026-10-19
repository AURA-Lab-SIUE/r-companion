# Runner check, not generated: the numbers the decks and workbook print, computed on the
# analysis file this run built (the helper route by default, chapter 4's route on request).
analysis %>%
  count(is_gaming)
analysis %>%
  count(viewer_band)
analysis %>%
  filter(!is.na(viewer_band), !is.na(channel_type)) %>%
  count(viewer_band, channel_type) %>%
  pivot_wider(names_from = channel_type, values_from = n, values_fill = 0)
analysis %>%
  filter(!is.na(is_gaming)) %>%
  group_by(is_gaming) %>%
  summarize(
    n = n(),
    mean = mean(message_length, na.rm = TRUE),
    median = median(message_length, na.rm = TRUE),
    sd = sd(message_length, na.rm = TRUE)
  ) %>%
  mutate(across(c(mean, median, sd), ~ round(.x, 2)))
run_chi_square(analysis, x = viewer_band, y = channel_type)
run_t_test(analysis, value = message_length, group = is_gaming)
# The ANOVA groups by the channel's main category: main_game on the default route (where game
# is the snapshot's category), game on chapter 4's route.
if ("main_game" %in% names(analysis)) analysis <- analysis %>% mutate(game = main_game)
four <- analysis %>%
  filter(!is.na(game)) %>%
  count(game, sort = TRUE) %>%
  slice_head(n = 4) %>%
  pull(game)
fit <- aov(message_length ~ game, data = analysis %>% filter(game %in% four))
fit %>%
  broom::tidy() %>%
  mutate(eta_sq = sumsq / sum(sumsq))
lm(message_length ~ is_gaming, data = analysis) %>%
  broom::tidy()
