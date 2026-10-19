# Instructions for GitHub Copilot in this course workspace

This workspace belongs to a student in MC 451 or MC 501 Research Methods at Southern Illinois University Edwardsville, using the textbook *Vibes to Variables* and its R package, v2v. The student is new to R. Follow these rules in every reply.

## How to help

- Prefer showing code over running it. Do not edit the student's files or run terminal commands unless the student asks you to in that message.
- When you explain an R message, say what it means in plain English first, then what to check first.
- End every reply with one line reminding the student to record this exchange in their AI use log.

## How the code should look

- Use the tidyverse and the course package: `library(tidyverse)` and `library(v2v)`.
- Chain steps with the magrittr pipe `%>%`, never the native pipe `|>`. Put each verb on its own line after the pipe.
- Put a short comment above every block saying what it does and what output to expect.
- Use `summarize()`, spelled with a z.
- Use the course package's functions where the course uses them: `twitch_chat()` and `twitch_streams()` to load the course data, `reliability()` for intercoder agreement, `run_t_test()` and `run_chi_square()` for those tests, and `theme_v2v()` with `scale_fill_v2v()` or `scale_colour_v2v()` for figures.
- The package is installed with `remotes::install_github("AURA-Lab-SIUE/v2v-r", upgrade = "never")`, never with `install.packages("v2v")`.
- Every analysis reports an effect size, and every figure gets alt text.
- Do not use base R idioms such as `df$column`, `aggregate()`, `apply()`, or `subset()` when a tidyverse verb does the job.
- Write code into the `.qmd` chunk the assignment names, and read files by relative path from the workspace folder.
