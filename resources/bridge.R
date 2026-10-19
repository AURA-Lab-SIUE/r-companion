# Data bridge for the AURA Lab R Companion viewer.
#
# Turns one R expression (a data frame) into JSON on stdout: {"columns":[{name,type}],"data":[...]}.
# The extension calls this with:  Rscript bridge.R --expr "v2v::twitch_chat()"
# Nothing is written to disk here; the extension saves the snapshot. Errors go to stderr, exit 2.

suppressWarnings(suppressMessages(library(jsonlite)))

args <- commandArgs(trailingOnly = TRUE)
get_arg <- function(flag) {
  i <- which(args == flag)
  if (length(i) == 0L || i[1] == length(args)) return(NULL)
  args[i[1] + 1L]
}

expr <- get_arg("--expr")
if (is.null(expr)) {
  message("bridge.R: no --expr given")
  quit(status = 2L)
}

result <- tryCatch(
  {
    df <- eval(parse(text = expr), envir = globalenv())
    df <- as.data.frame(df, stringsAsFactors = FALSE, check.names = FALSE)
    rownames(df) <- NULL  # keep jsonlite from adding a _row field from the data frame's row names
    types <- vapply(df, function(col) class(col)[1], character(1))
    cols <- data.frame(name = names(df), type = unname(types), stringsAsFactors = FALSE)
    # Flatten any non-atomic column (list, difftime, and the like) to text so the JSON is a grid.
    for (nm in names(df)) {
      if (!is.atomic(df[[nm]])) {
        df[[nm]] <- vapply(df[[nm]], function(x) paste(format(x), collapse = "; "), character(1))
      } else if (inherits(df[[nm]], c("Date", "POSIXct", "POSIXt", "factor"))) {
        df[[nm]] <- as.character(df[[nm]])
      }
    }
    toJSON(list(columns = cols, data = df), dataframe = "rows", na = "null", auto_unbox = TRUE, digits = NA)
  },
  error = function(e) {
    message(paste0("bridge.R: ", conditionMessage(e)))
    quit(status = 2L)
  }
)

cat(result)
