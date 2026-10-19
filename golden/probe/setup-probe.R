# AURA Lab R Companion: read v2v::setup() as JSON. __COURSE__ is mc451 or mc501; __OUT__ is a path.
# On v2v 0.3.3 or later the checks come from setup(quiet = TRUE); on 0.3.2 "checks" is null and
# the extension falls back to its own package check.
local({ v <- as.character(utils::packageVersion("v2v")); ok <- if (utils::compareVersion(v, "0.3.3") >= 0) v2v::setup(course = "__COURSE__", quiet = TRUE) else suppressMessages(v2v::setup()); jsonlite::write_json(list(probe = "setup", v2v = v, ok = as.logical(ok), checks = attr(ok, "checks")), "__OUT__", auto_unbox = TRUE, null = "null", na = "null") })
