# Changelog

## 0.3.0 (R3: the data viewer and coding sheet)

- **AURA: Open the data viewer** opens a CSV file, or an R data frame through an Rscript JSON bridge, in an AG Grid Community webview. Data values are read only, with scroll, sort, filter, and column types. Measured on m4: the 35,267-row Twitch sample parses in about 65 ms and renders in about 64 ms.
- **Coding sheet.** Add coding columns (a dropdown of allowed values typed or pasted from a codebook, or free text) and enter a value per row from the keyboard: type, Enter moves down. Autosave and undo. Codes are stored in a separate long file, `data/derived/<name>-codes.csv` (row_id, column, value, coded_at); the original file is never written. A `row_id` column is added only when the data has none.
- **Insert rebuild code.** Inserts a commented plain-tidyverse chunk that rebuilds the coded data from the original plus the codes file (read_csv, pivot_wider, left_join by row_id), in house style. Proven in R to reproduce the coded grid exactly.
- **Refresh** re-reads the data. **Export HTML for accessibility check** writes a self-contained grid for axe.
- Accessibility: the ARIA grid pattern, keyboard-only entry, a visible focus ring, `--vscode-*` theme colors, and a high-contrast rule.
- Safety: the codes file is written atomically on a debounce and flushed on close; a hard kill mid-entry loses no saved work. The original file is hashed on open and left untouched.

## 0.2.1 (fixes from the R2 card run of 2026-10-19)

- MC 451 and MC 501 need v2v 0.3.3 or newer. **Check my setup** marks an older v2v **NEEDS UPDATE**, and **Install what is missing** installs the current release from GitHub with `upgrade = "never"`.
- **Count rows per group** reads `chat`, the table **Load the course Twitch corpus** makes, and counts by `channel`, so it runs in the order the menu lists it. It used to read `analysis` and stopped with `object 'analysis' not found` unless **Load your saved analysis** had run first.
- Count, filter, and select offer only the tables the script has already made: `analysis` once the script assigns it above the cursor or **Load your saved analysis** has been run, and `chat_streams` after the join. When there is more than one, the menu asks which. **Choose the column** reads the columns of that table directly, with no file to pick.
- A filter on a `TRUE`, `FALSE`, or number value writes it without quotation marks, and a column with many values asks for the value to keep.
- **Match each message to its stream** writes `join_chat_streams(chat, streams)` alone. The `rename(ts = ts.x, snapshot_ts = ts.y)` line v2v 0.3.2 needed stops with an error on 0.3.3, which returns `ts` and `snapshot_ts` itself.

## 0.2.0 (R2 Data, wrangling, and the reliability grid)

- **AURA: Write R code** quick-pick wizard. It writes a commented tidyverse block for each task, matching what the course pages show line for line, and inserts it at the cursor in a `.R` file or a `.qmd` chunk, then offers to run it. Every block keeps its comment header (owner decision U1).
- Course profiles decide the code: MC 427 writes plain tidyverse with `%>%`; MC 451 and MC 501 write the v2v helpers and the rubric-named wrappers. The column picker reads a JSON probe of the data, never console text.
- **R2 Data** tasks: import a CSV, load the course Twitch corpus or a saved RDS, filter, select, mutate, count, `clean_dates()` (with a plain `as.POSIXct()` alternative), `join_chat_streams()`, label channels by top category and join the labels on (with a per-moment alternative), save as CSV or RDS, and reliability.
- **AURA: Reliability grid**, the one webview. It hides Pass 1 while Pass 2 is entered and records the date of each pass (U6), saves the coded items as a CSV, and generates the `reliability()` call that reads them. It follows the VS Code theme, labels every field, and is keyboard operable. Hidden in MC 427.
- The R3 (Describe and plots) and R4 (Tests and sentences) menus are built and tested but stay behind the `auraR.previewReleases` setting until their release dates.
- MC 451 and MC 501 write the plain R calls by default (owner decision q-20261018-0044): `irr::kappa2()` and `irr::kripp.alpha()` for reliability, and `t.test()`, `chisq.test()`, and `effectsize` for the tests, each with the v2v wrapper last as a check that prints the same numbers. The setting `auraR.plainCalls` (on by default) switches back to the wrappers alone. Krippendorff's alpha numbers the codes from the data, so any codebook works. MC 451's setup check now recommends `effectsize`.
- Generated R follows the house style (magrittr `%>%`, one verb per line, a comment per block) and is verified two ways: a unit test asserts each of the 78 generated blocks is byte-identical to the golden fixtures, and every block was run through Rscript against the course data on v2v 0.3.2 and 0.3.3.

## 0.1.3

- Get Started: **Pick your course** ticks when the student picks a course, including the one the extension already found, and never before. It used to tick on its own when the folder held a course file, or, when VS Code opened no Welcome page at startup, never tick at all; **Open your course workspace** had the same fault. Steps now record their tick through VS Code's own walkthrough command as well as the context key.

## 0.1.2

- Listing image: a plain gold tile from the SIUE palette, with no mark, letter, or symbol, until UMC settles an approved identity for AURA Lab.

## 0.1.1 (R1.0.1, fixes from the leith-hp test of 2026-10-19)

- **Install what is missing** installs CRAN binaries only on Windows and macOS. R's default installed a package from source whenever the source was newer than the binary (datawizard, performance), which fails without Rtools for any package that needs compiling.
- The R extension for VS Code is a required line in every course, as each course's setup guide has it, so the report never prints `SETUP OK` while that line is not OK. **Install what is missing** adds it.
- Walkthrough steps get their tick only when the action has worked: a course is chosen, every required line is OK, a folder is open, or the help list is shown. Cancelling no longer ticks a step.
- Restricted Mode: one dialog that stays until answered, and the R terminal or course script starts by itself once the folder is trusted.
- The "Course set to ..." notification is short enough to read whole.
- Integration check: `scripts/integration.mjs` runs the extension in a fresh VS Code profile.

## 0.1.0 (R1 Setup)

- **AURA: Check my setup** finds R (settings, PATH, Windows registry, standard folders), checks each package the course needs, Quarto and Git where the course uses them, and shows `v2v::setup()` as a checklist for MC 451 and MC 501.
- **AURA: Install what is missing** installs with the CRAN mirror set, into the personal library when needed, and the course package v2v from GitHub. It then re-checks from the R library, never from the exit code.
- Get Started walkthrough: pick your course, check setup, open your course workspace, where to get help.
- **AURA: Explain an R error**: the failure headings from the course install and fix-it pages, mapped to plain-English fixes.
- Three ways to run R: Positron, the R extension (REditorSupport), or a plain R terminal with bracketed paste off.
- Update check for `.vsix` installs only, off until a release address is set. No telemetry.
