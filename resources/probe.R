# AURA Lab R Companion: setup probe.
#
# Run by the extension as: Rscript probe.R <comma-separated packages> <run v2v setup: 0 or 1>
# Prints one JSON object between two marker lines, so anything a student's .Rprofile
# prints cannot break the parse. This file is plumbing, not teaching code: it must run
# before any package is installed, so it uses base R only (no tidyverse, no jsonlite).

args <- commandArgs(trailingOnly = TRUE)
pkgs <- if (length(args) >= 1 && nzchar(args[1])) strsplit(args[1], ",", fixed = TRUE)[[1]] else character()
run_v2v_setup <- length(args) >= 2 && identical(args[2], "1")

# Escape a string for JSON
json_str <- function(x) {
  if (is.null(x) || length(x) == 0 || is.na(x)) return("null")
  x <- as.character(x)
  x <- gsub("\\", "\\\\", x, fixed = TRUE)
  x <- gsub("\"", "\\\"", x, fixed = TRUE)
  x <- gsub("\n", "\\n", x, fixed = TRUE)
  x <- gsub("\r", "\\r", x, fixed = TRUE)
  x <- gsub("\t", "\\t", x, fixed = TRUE)
  x <- gsub("[[:cntrl:]]", "", x)
  paste0("\"", x, "\"")
}
json_bool <- function(x) if (isTRUE(x)) "true" else "false"
json_arr <- function(items) paste0("[", paste(items, collapse = ","), "]")

# Look each package up in the library, the same way library() would find it
pkg_items <- vapply(pkgs, function(p) {
  path <- tryCatch(find.package(p, quiet = TRUE), error = function(e) character())
  if (length(path) == 0) {
    return(paste0("{\"name\":", json_str(p), ",\"installed\":false,\"version\":null,\"loads\":false,\"error\":null}"))
  }
  ver <- tryCatch(as.character(utils::packageVersion(p)), error = function(e) NA_character_)
  # A package can be on disk and still fail to load (a half-finished install)
  err <- tryCatch({ loadNamespace(p); NA_character_ }, error = function(e) conditionMessage(e))
  paste0("{\"name\":", json_str(p), ",\"installed\":true,\"version\":", json_str(ver),
         ",\"loads\":", json_bool(is.na(err)), ",\"error\":", json_str(err), ",\"path\":", json_str(path[1]), "}")
}, character(1))

# Command-line tools, looked up the way v2v::setup() does
quarto_path <- unname(Sys.which("quarto"))
git_path <- unname(Sys.which("git"))

# Which library would install.packages() write to?
libs <- .libPaths()
writable <- vapply(libs, function(l) file.access(l, 2) == 0, logical(1))

# v2v::setup(), captured as plain text lines so the extension can show it as a checklist
v2v_lines <- "null"
v2v_error <- "null"
if (run_v2v_setup) {
  if (length(tryCatch(find.package("v2v", quiet = TRUE), error = function(e) character())) == 0) {
    v2v_error <- json_str("v2v is not installed")
  } else {
    out <- tryCatch({
      options(cli.unicode = FALSE, cli.num_colors = 1, cli.width = 200, cli.dynamic = FALSE)
      cli::cli_fmt(v2v::setup())
    }, error = function(e) structure(conditionMessage(e), class = "probe_error"))
    if (inherits(out, "probe_error")) {
      v2v_error <- json_str(unclass(out))
    } else {
      v2v_lines <- json_arr(vapply(out, json_str, character(1)))
    }
  }
}

json <- paste0(
  "{",
  "\"r\":{\"version\":", json_str(paste(R.version$major, R.version$minor, sep = ".")),
  ",\"string\":", json_str(R.version.string),
  ",\"home\":", json_str(R.home()),
  ",\"platform\":", json_str(R.version$platform), "},",
  "\"libPaths\":", json_arr(vapply(libs, json_str, character(1))), ",",
  "\"libWritable\":", json_arr(vapply(writable, json_bool, character(1))), ",",
  "\"userLib\":", json_str(Sys.getenv("R_LIBS_USER")), ",",
  "\"packages\":", json_arr(pkg_items), ",",
  "\"quarto\":", json_str(if (nzchar(quarto_path)) quarto_path else NA), ",",
  "\"git\":", json_str(if (nzchar(git_path)) git_path else NA), ",",
  "\"v2vSetup\":{\"lines\":", v2v_lines, ",\"error\":", v2v_error, "}",
  "}"
)

cat("\n@@AURA_PROBE_BEGIN@@\n", json, "\n@@AURA_PROBE_END@@\n", sep = "")
