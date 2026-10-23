# AURA Lab R Companion: the full guide

The README is the short version. This page carries the detail per feature, the settings, how the extension finds and runs R, accessibility, and how to adapt it for another course. It is the source for the R Companion page on the AURA Lab site.

## What it does (release 0.5.3, the AURA panel)

- **The AURA panel.** An Activity Bar view with My setup (the last Check my setup in one line), Data, Describe, Test, Your steps, and Help. Every task node runs Write R code straight into that task, with the menu's label. It is a native tree view: arrow keys and Enter, **AURA: Focus on R Companion View** in the Command Palette, and each row's accessible name is its label.
- **Import a data file (CSV or Excel).** A file picker, a table name checked as a valid R name, the sheet for a workbook with more than one, and a peek at the columns before anything is written. Excel reads with `readxl::read_excel()`; MC 451 and MC 501 add `janitor::clean_names()` when a column name has spaces or capitals. A file outside the course folder is written with its full path and a notice.
- **Join two tables by a shared column.** `left_join()` or `inner_join()`, a key list of the columns both tables have, a warning when the key repeats on the right, and two checks in the code (the row count and the `anti_join()` count of rows with no match).
- **Your steps.** Blocks go into the open script, or to `steps.R` in the course folder when none is open. **Open my steps** and **Run my steps from the top** (`source(..., echo = TRUE)`, or `knitr::purl()` first for Quarto) work on the script that holds them; the panel lists its `# ---- section ----` headings.
- **One-click fixes.** Turn off bracketed paste for this folder, Close R terminals and install again, and Update the R extension, offered beside their explanations. Check my setup reads the R extension's version (3.0.0 or newer for R 4.6).
- **Objects in R** opens the R extension's Workspace panel, the environment view.

## What it does (release 0.1, "R1 Setup")

- **AURA: Check my setup.** Finds R on your computer and reports, line by line, whether each package your course needs is installed, plus Quarto and Git where the course uses them, and the R extension for VS Code, which every course's setup guide installs. `SETUP OK` and the walkthrough tick appear only when every required line is OK. For MC 451 and MC 501 it also shows the course package's own check, `v2v::setup()`, as a checklist. Every line carries a status word (OK, MISSING, NEEDS UPDATE, BROKEN, CHECK, NOTE), so nothing depends on color.
- **AURA: Install what is missing.** Runs `install.packages()` with the CRAN mirror already set, into your personal R library when the system one is not writable, and installs the course package `v2v` from GitHub with `remotes::install_github("AURA-Lab-SIUE/v2v-r", upgrade = "never")`, as the course hub's install page does. On Windows and macOS it installs CRAN's ready-built binaries only, so nothing needs Rtools or compiling. It adds the R extension for VS Code when it is missing (VS Code first asks you to trust its publisher, REditorSupport). Then it checks again by asking R what is actually in the library. An exit code is never taken as proof.
- **Get Started walkthrough.** Four steps: pick your course, check your setup, open your course workspace, and where to get help. A step gets its tick when its action has worked, not when its button is selected.
- **Restricted Mode.** Opening an R terminal or running the course script in a folder VS Code has not trusted shows one dialog. Its **Trust this folder** button opens VS Code's Workspace Trust page; select **Trust** there and the paused action carries on by itself.
- **AURA: Explain an R error.** Paste a message R printed and get a plain-English explanation, the steps to fix it, and a link to the course page that covers it.
- **AURA: Run the course setup check script.** For MC 427, runs `mc427-setup-check.R` in an R terminal so the `SETUP OK` line appears for the Tools Stack Setup screenshot.

## What it does (release 0.2, "R2 Data and the reliability grid")

- **AURA: Write R code.** A short list of tasks (import a CSV or the course Twitch corpus, filter, select, mutate, count, clean dates, join chat to streams, label channels, save as CSV or RDS). Each task writes a commented tidyverse block into your `.R` file or `.qmd` chunk at the cursor, the same code the course pages show, then offers to run it. MC 427 gets plain tidyverse; MC 451 and MC 501 get the `v2v` helpers their decks use. The comment header stays with the code, so you can explain every line.
- **AURA: Reliability grid** (MC 451 and MC 501). Enter your two coding passes item by item: Pass 1 is hidden while you enter Pass 2, and the date of each pass is recorded. It saves the items as `data/reliability-pilot.csv` and writes the R that reads them: Cohen's kappa and Krippendorff's alpha with `irr::kappa2()` and `irr::kripp.alpha()`, followed by the `v2v` `reliability()` call as a check that prints the same kappa.

## What it does (release 0.3, "the data viewer and coding sheet")

- **AURA: Open the data viewer.** Opens a CSV file, or an R data frame through an Rscript JSON bridge, in a grid with scroll, sort, filter, and column types. Data values are read only. It handles the 35,000-row course Twitch sample smoothly (about 65 ms to parse and 64 ms to render on a desktop).
- **Coding sheet.** Add your own coding columns (a dropdown of allowed values you type or paste from your codebook, or free text) and enter a value per row from the keyboard as in a spreadsheet: in a column with a list of codes, type the first letters of a code and press Enter to save it and move down (Tab moves right, Escape cancels, F2 or a double-click shows the whole list, Delete clears); in a free-text column, type and press Enter. Work saves by itself, and Ctrl+Z (Cmd+Z on a Mac) undoes. Codes are kept in a separate long file, `data/derived/<name>-codes.csv`, with one row per coded cell (row_id, column, value, coded_at). Your original data file is never written. The viewer adds a `row_id` column only when the data has none.
- **Insert rebuild code.** Writes a commented tidyverse chunk that rebuilds the coded data from the original file plus your codes (read_csv, pivot_wider, left_join by row_id), so the result is reproducible and the original stays untouched.
- **Refresh** re-reads the data file.

## What it does (release 0.4, "R3 Describe and R4 Tests", every menu on)

- **Describe** tasks in **AURA: Write R code**: a frequency table with percents, a crosstab with proportions, a summary by group, and a bar chart, histogram, or boxplot. Each chart's code carries `alt = "YOUR TURN: ..."` in `labs()` for the alt text you write, and in a Quarto document the chunk also gets a `#| fig-alt:` line, because Quarto reads alt text only from there.
- **Test** tasks: the settings block that names the variables, a Welch t-test with Cohen's d, a chi-square test with Cramer's V, a one-way ANOVA with eta squared, a linear regression, and a correlation, each written the way your course's rubric shows it.
- **Check my test choice.** Say what kind of variables you have and which test you chose; the companion says whether it fits and why. It checks your choice and does not make it for you, because choosing the test is part of your grade.
- **APA numbers to check your sentence.** Prints a test's numbers in APA form from your own data, for example `t(3768.7) = -4.94, p < .001, d = -0.13, 95% CI [-0.16, -0.09]`, so you can check the numbers in the sentence you wrote. It never writes the sentence's words or what the result means.
- **Copilot tools** (MC 451 and MC 501). GitHub Copilot Chat's agent mode can call three read-only tools: **Check my R setup**, **Explain an R error**, and **Check my test choice**. None changes a file, installs anything, or runs your analysis. They are off in MC 427, whose course rules do not let Agent mode run anything. Everything else works the same with Copilot off.
- **MC 427, Module 5.** Copilot writes the code for your graded analyses; the Test menu is a check on it. The menu's heading says so, and a difference between the two is logged as a Copilot error you caught.

## How it finds R

In order: the `auraR.rPath` setting, the R extension's `r.rpath` and `r.rterm` settings, your PATH, then on Windows the registry and the standard install folders (the Windows R installer leaves R off the PATH on purpose), and on macOS the R.framework and Homebrew locations.

## How it runs R

Inside Positron it uses Positron's console. Where the R extension by REditorSupport is installed, it uses that extension's terminal. Otherwise it opens a plain R terminal with bracketed paste switched off, so the stray `[200~` characters never appear. Package checks use a short-lived `Rscript` process and never touch your R session.

## Privacy

No telemetry. The only network traffic is the CRAN and GitHub downloads you start with Install what is missing. Copies installed from the Visual Studio Marketplace or Open VSX are updated by VS Code itself. A copy installed from a `.vsix` file is not updated; install the newer `.vsix`, or install from a marketplace.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `auraR.course` | empty | Your course. Empty means the extension asks once and remembers. |
| `auraR.rPath` | empty | Full path to `Rscript`, when the extension cannot find R by itself. |
| `auraR.cranMirror` | `https://cloud.r-project.org` | Download site for Install what is missing. |
| `auraR.runWith` | `auto` | `auto`, `positron`, `vscode-r`, or `terminal`. |
| `auraR.copilotTools` | `auto` | The three Copilot tools: `auto` is on for MC 451 and MC 501 and off for MC 427; `on` or `off` in every course. |
| `auraR.apaCheck` | on | Offers **APA numbers to check your sentence** in the Test menu. |

## Accessibility

The setup features use only native VS Code interface: the Command Palette, quick picks, notifications, the Output panel, and the Get Started walkthrough. All of it is keyboard-operable and read by screen readers, and it follows your color theme, including high contrast.

The reliability grid and the data viewer are the two webviews. Both take their colors from your VS Code theme, label every field, and are keyboard-operable. The data viewer follows the WAI-ARIA grid pattern (role grid, rows, and cells, with row and column counts), is fully keyboard-operable (navigate, type the first letters of a code, Enter to save and move down, Tab to move right, Ctrl+Z to undo), announces the chosen code (an ARIA combobox and a polite status line), shows a visible focus ring, labels every control, takes its colors from your VS Code theme through the `--vscode-*` variables, and has a high-contrast rule. For an axe check, `node scripts/verify/export-grid-html.mjs` writes a self-contained copy of the grid.

## Adapting this for your course

The extension is built so another course, or another campus, can adopt it by editing a small set of files. All of them are plain TypeScript or Markdown, and `npm test` exercises each one.

1. **Add a course profile** in `src/profiles.ts`. A profile names the course, the minimum R version, and the package list (CRAN or GitHub, required or recommended, with a plain-English "why" shown beside each package). It also declares whether the course needs Quarto and Git, the workspace template students copy, and the help links shown when a check fails. Register the new id in the `CourseId` type and the `COURSE_IDS` list in the same file.
2. **Point the checks at your course's setup script and result line.** If your course grades a setup screenshot, set `setupScript` and `resultLines` in the profile. The `ok` string must match what your script prints character for character; MC 427's `SETUP OK: R and the course packages are working.` line and its `mc427-setup-check.R` script in [mc427-codespace](https://github.com/AURA-Lab-SIUE/mc427-codespace) show the shape.
3. **Extend the error explainer** in `src/errors.ts`. Each entry is a regular expression matched against the pasted message, a plain-English "why," fix steps, a help link, and optionally the courses it applies to.
4. **Generated install code** comes from `src/installScript.ts`, which writes the `install.packages()` script from the profile's package list (CRAN mirror set, binary-only installs on Windows and macOS, a personal library when the system one is not writable). A new profile usually needs no change here.
5. **Copilot instructions** your course hands to students live in `resources/course-files/`; add a file there and name it in the profile's `copilotInstructions` field.
6. **Change the code the menus write** in `src/codegen/`: `r2.ts` (data and wrangling), `r3.ts` (describe and charts), `r4.ts` (tests), and `apa.ts` (the APA numbers). Each task is a template that takes your data and column names; the menu list itself is the `CATALOG` in `src/menus.ts`. Your course's own example code makes the best test: put it in `golden/` and the unit tests check each template against it byte for byte.
7. **Change the test-choice rules** in `src/testChoice.ts` if your course teaches other tests, and decide in the settings whether the Copilot tools are on for your course (`auraR.copilotTools`).
8. **Build a VSIX** with `npm run package`. It runs the separation check and the unit tests, then writes `dist/r-companion-<version>.vsix`, which installs through VS Code's **Install from VSIX** command without any marketplace.

If you publish an adapted build, change `name`, `displayName`, and `publisher` in `package.json` so it does not collide with this extension on the Visual Studio Marketplace or Open VSX.
