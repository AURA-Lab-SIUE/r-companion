# AURA Lab R Companion: column probe.
# The extension substitutes two tokens and runs the result, either with Rscript
# (a file on disk) or by sending it to the student's R session (an object
# already loaded). It writes JSON to a file, never to the console, so startup
# messages, .Rprofile output, and readr's column report cannot corrupt it.
#   __DATA__  an R expression for the data: readr::read_csv("file.csv", show_col_types = FALSE),
#             readRDS("file.RDS"), v2v::twitch_chat(), or the name of a data frame in the session
#   __OUT__   a path the extension chose, forward slashes
local({ x <- __DATA__; jsonlite::write_json(list(probe = 1L, rows = nrow(x), columns = lapply(names(x), function(n) { v <- x[[n]]; u <- unique(v); list(name = n, class = class(v)[1], type = pillar::type_sum(v), n_missing = sum(is.na(v)), n_distinct = length(u), values = if (is.factor(v)) levels(v) else if ((is.character(v) || is.logical(v)) && length(u) <= 12) sort(as.character(u[!is.na(u)])) else NULL) })), "__OUT__", auto_unbox = TRUE, null = "null", na = "null", digits = NA) })
