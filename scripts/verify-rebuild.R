# Proves the generated rebuild chunk reproduces the coded data exactly.
# Run by e2e-verify.cjs with the working directory set to the test project.
#
# It (1) checks the generated chunk is valid R, (2) runs its pipeline, using the real tidyverse if
# it is installed and the component packages (readr, dplyr, tidyr) if not, and (3) asserts every
# coded cell in coded_data equals what was entered, that uncoded cells are NA, and that the join
# kept every original row and column.

chunk_text <- readLines("rebuild.R", warn = FALSE)

# (1) The chunk must parse as valid R, exactly as generated.
parsed <- tryCatch(parse(text = paste(chunk_text, collapse = "\n")), error = function(e) e)
if (inherits(parsed, "error")) {
  cat("PARSE: FAIL -", conditionMessage(parsed), "\n")
  quit(status = 1L)
}
cat("PARSE: PASS (generated chunk is valid R)\n")

have_tidyverse <- "tidyverse" %in% rownames(installed.packages())
if (have_tidyverse) {
  cat("LIBS: using the tidyverse metapackage (student path)\n")
  run_text <- chunk_text
} else {
  cat("LIBS: tidyverse metapackage not installed; running with readr+dplyr+tidyr\n")
  run_text <- sub("^library\\(tidyverse\\)$", "suppressMessages({library(readr);library(dplyr);library(tidyr)})", chunk_text)
}

env <- new.env()
suppressWarnings(suppressMessages(eval(parse(text = paste(run_text, collapse = "\n")), envir = env)))
coded <- get("coded_data", envir = env)
original <- get("original", envir = env)

expected <- jsonlite::fromJSON("expected.json")  # matrix: row_id, column, value

fail <- 0L
# (3a) every coded cell matches
for (i in seq_len(nrow(expected))) {
  rid <- expected[i, 1]; col <- expected[i, 2]; val <- expected[i, 3]
  got <- coded[[col]][coded$row_id == rid]
  if (length(got) != 1L || is.na(got) || got != val) {
    cat(sprintf("CELL FAIL: row_id=%s %s expected='%s' got='%s'\n", rid, col, val, paste(got, collapse = ",")))
    fail <- fail + 1L
  }
}

# (3b) an uncoded cell is NA (row 3 was never coded for tone)
if (!is.na(coded$tone[coded$row_id == "3"])) {
  cat("NA FAIL: an uncoded cell is not NA\n"); fail <- fail + 1L
}

# (3c) the join kept every row and every original column
if (nrow(coded) != nrow(original)) {
  cat(sprintf("ROWS FAIL: coded=%d original=%d\n", nrow(coded), nrow(original))); fail <- fail + 1L
}
missing_cols <- setdiff(setdiff(names(original), "row_id"), names(coded))
if (length(missing_cols) > 0) {
  cat("COLUMNS FAIL: lost", paste(missing_cols, collapse = ","), "\n"); fail <- fail + 1L
}

if (fail == 0L) {
  cat(sprintf("REBUILD: PASS - %d coded cells reproduced exactly, %d rows, %d original columns kept\n",
              nrow(expected), nrow(coded), length(intersect(names(original), names(coded)))))
  quit(status = 0L)
} else {
  cat(sprintf("REBUILD: FAIL - %d problem(s)\n", fail))
  quit(status = 1L)
}
