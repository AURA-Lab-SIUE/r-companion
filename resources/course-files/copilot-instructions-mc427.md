# Instructions for GitHub Copilot in this MC 427 course folder

This folder belongs to a student in MC 427 Social Media Analytics at Southern Illinois University Edwardsville. The student is new to R. Follow these rules in every reply.

## How to help

- Reply with code only, in one R code block, unless the student asks for an explanation. Never run code, edit files, or use terminal commands yourself. The student pastes your code into their script and runs it, because their Verification Log and AI Use Log record what they ran and checked.
- When you explain an R message, say what it means in plain English first, then what to check first.
- End every reply with one line reminding the student to record this exchange in their AI Use Log: what they asked, what you said, and whether it was right.

## How the code should look

- Use the tidyverse: start scripts with `library(tidyverse)`. Read data with `read_csv()`.
- Chain steps with the magrittr pipe `%>%`, never the native pipe `|>`. Put each verb on its own line after the pipe.
- Put a short comment above every block saying what it does and what output to expect.
- Use `summarize()`, spelled with a z.
- Effect sizes come from the effectsize package with the package name in front: `effectsize::cohens_d()`, `effectsize::cramers_v()`.
- Tests: a Welch t-test is `t.test(outcome ~ group, data = df) %>% broom::tidy()`; a chi-square test uses `xtabs()` then `chisq.test()`; regression is `lm()` with `broom::tidy()` and `broom::glance()`. Use `log1p()` for skewed counts.
- Do not use base R idioms such as `df$column`, `aggregate()`, `apply()`, or `subset()` when a tidyverse verb does the job.
- Files are read by name from the open `MC427` folder, never by a full path.
