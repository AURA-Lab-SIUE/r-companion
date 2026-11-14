# ---- Save several tables in one file: save() ----
# An .RData file holds several tables. Each one comes back under the same name when you
# load the file. Prints nothing.
save(analysis, chat, file = "data/my-tables.RData")

# Look inside the saved file without changing your tables: it lists the names it holds.
load("data/my-tables.RData", envir = new.env(), verbose = TRUE)
