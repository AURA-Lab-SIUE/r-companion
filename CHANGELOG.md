# Changelog

## 0.5.1 (full error explanations, two more MC 427 messages, line chart dates from clean_dates(), chart tab waits for the file)

- **Explain an R error shows the whole explanation.** The quick pick showed each Why and Step on one line and cut it off with an ellipsis, so the instructions could not be read. Now the full explanation opens as a read-only Markdown preview beside your code: the title, the part of your message it explains, why it happens, the numbered steps, and the help link. When one explanation matches it opens straight away; when several match, the quick pick lists them and the one you pick opens. The preview stays open while you follow the steps in the editor and terminal, a screen reader reads it as headings, a paragraph, and a numbered list, Tab reaches the link, and Ctrl+W closes it. Nothing is written to your folder.
- **Two more MC 427 messages are explained.** A t-test that prints `t = NaN, df = NaN` with group means of `-Inf` (the MC 427 Module 5 R00 table's log-of-zero row; matched in the printed test, the two mean lines, and the `broom::tidy()` row), and the warning `argument is not numeric or logical: returning NA` from `mean()` on a text column (R Field Guide C11). Both texts were reproduced in R 4.6.1. When that warning comes with a `[1] NA`, only the text-column explanation opens. Neither entry carries a help link, because no public course page covers either message.
- **The line chart takes its time column from `clean_dates()`.** The chart block converted the date with `as.POSIXct(date / 1000, ...)`, while MC 451 and MC 501 now teach the v2v helpers in the wrangling step. It now writes `ts = clean_dates(date)` and `floor_date(ts, "6 hours")`, exactly as decks s23 and w12 shape this chart. It rebuilds `ts` rather than assuming the column is there, because in a describing session `streams` comes fresh from `twitch_streams()` without it, and a bare `ts` would then find R's `ts()` function and stop with "Unsupported date-time class 'function'". The chart is unchanged: the same 97 rows either way.
- **A saved chart opens whenever R finishes it.** The chart tab used to wait 12 seconds after sending the code, so if R was still busy the picture never opened. The Companion now starts watching the PNG before it sends the code and opens the tab once the file is completely written, for up to 5 minutes. If the picture never appears, the AURA Lab R Companion output says where it looked and what to check.

## 0.5.0 (every course error explained, line chart, grouped histogram, MC 501 power analysis, charts open in a tab)

- **Explain an R error covers every course message.** 28 new entries bring the explainer from 19 to all 49 messages the course pages, decks, workbook, and `?v2v::common_errors` name, including MC 427's Module 5 R00 table. New entries include `object 'x' not found`, columns that don't exist, `'\U' used without hex digits` in a Windows path, `=` where `==` was meant, `Chi-squared approximation may be incorrect`, a t-test grouping variable without exactly 2 levels, a missing `+` in a ggplot, the year-50,888 date, a join that returns all `NA` or grows the row count, Quarto not found, `Failed to spawn Rscript`, YAML errors, `Permission denied (publickey)`, `Author identity unknown`, `Repository not found`, merge conflicts, and GitHub's large-file limit. Every pattern was reproduced in R 4.6.1 where R or the tool prints the text, and every help link points at aura-lab.siue.edu and opens on a section of the live page that covers the message or the step that causes it. No public page discusses object or column not found, the `\U` path, `=` for `==`, or the log of zero, so those entries show their fix steps without a link.
- **Line chart over time** (R3, MC 451 and MC 501). Buckets the stream snapshots into six-hour blocks, keeps the five biggest game categories plus "Other", and draws one line per category with `geom_line()`, as decks s23 and s24, w12, and workbook chapter 5 do.
- **Histogram comparing two groups** (R3, MC 451 and MC 501). Overlays message length for gaming and non-gaming channels (`fill = is_gaming`, `position = "identity"`, see-through bars).
- **Power analysis for your sample size** (R4, MC 501). Writes a plain `pwr.t.test(d = 0.5, sig.level = 0.05, power = 0.80, type = "two.sample")` with one comment per argument; it returns 64 per group, matching w05. `pwr` is now required for MC 501, so **Check my setup** reports it and **Install what is missing** installs it.
- **Charts open in a VS Code tab.** After a chart block runs with **Run it**, the picture it saved with `ggsave()` opens in an editor tab beside the script. On Windows the R graphics window opened behind VS Code, so a student saw only a flashing taskbar button and could think the chart failed. Only a file written by that run is opened, never an older picture; the R graphics window and the R extension's plot viewer are left as they were.
- Verification: unit tests, byte-equality for every generated golden block, and every golden block run through Rscript on Windows (v2v 0.3.3, pwr, lm.beta, effectsize, broom, irr); the VS Code suites on the packaged VSIX.

## 0.4.1 (spreadsheet keys in the coding sheet, Run it with no R open, lm.beta for MC 501)

- **The coding sheet's keys work like a spreadsheet.** In a column with a list of codes, typing on a cell picks the first code that starts with the typed letters (capitals or not), with the matching codes listed under the cell; Backspace takes letters back off, and with none left the choice is a blank, which clears the cell. Enter saves and moves down a row, Tab saves and moves right (Shift+Tab left), and Escape cancels. F2 or a double-click shows the whole list on the cell's current code, where Up and Down choose and a click saves. Delete clears a coding cell. Letters that match no code say so and stay in the cell instead of moving on with nothing saved. In a free-text column, typing starts the edit and Enter saves and moves down. In 0.4.0, Enter only moved down and typing opened the list without choosing anything, so only F2, then Down, Down, Enter, worked. Autosave, undo (Ctrl+Z), the codes file, and the rebuild code are unchanged.
- Screen readers: the list editor is an ARIA combobox named for the column and row, its chosen option is announced through `aria-activedescendant` and a polite live region, and the status line (a polite live region) now names the code just saved, for example "tone, row 3: negative. Saved".
- The viewer's hint, its status after Add coding column, and the Add coding column prompt describe these keys.
- The header icons of the data viewer (sort and filter) drew as empty boxes: the webview's content security policy blocked the icon font AG Grid embeds as a `data:` URI. It is allowed now.
- **Run it with no R open.** A block run with the notification's **Run it** before any R terminal was open never reached R: the R extension (vscode-R 3.3) first asked where to run the code, and the R Interactive terminal it then opened showed R's banner but never ran the block. Run it now opens the companion's own R terminal when no R terminal is open, waits for R to start (the wait the course setup script uses), and then sends the block. With an R terminal already open, Run it sends where it did before (the R extension's terminal when there is one).
- **MC 501 requires `lm.beta`.** The regression block's standardized slope calls `lm.beta::lm.beta()`, so **Check my setup** reports it for MC 501 and **Install what is missing** installs it from CRAN like the other packages (owner decision q-20261019-0009).

## 0.4.0 (R2, R3, and R4 together: every menu on)

- Every release is on by default. The `auraR.previewReleases` setting is gone: **AURA: Write R code** lists the R2 Data, R3 Describe, and R4 Test tasks for every course, and the reliability grid and the data viewer and coding sheet stay on.
- **Check my test choice** (R4, also **AURA: Check my test choice**). The student says what kind of variables they have and which test they chose; the companion says whether that test fits and why. It checks the choice and does not make it, because choosing the test is graded. A mismatch says what the chosen test needs, without naming another test. The setting `auraR.testChoice` (`check` by default) can switch it to `suggest`.
- **APA numbers to check your sentence** (R4). For a chi-square test, a Welch t-test, a one-way ANOVA, a regression, or a correlation, it writes a short R block that prints the test's numbers in APA form from the student's own data, for example `t(3768.7) = -4.94, p < .001, d = -0.13, 95% CI [-0.16, -0.09]`. It never writes the words of the sentence or a plain-English interpretation, which stay the student's graded work. The setting `auraR.apaCheck` (on by default) hides it.
- **Copilot tools.** Three read-only tools GitHub Copilot Chat's agent mode can call: **Check my R setup**, **Explain an R error**, and **Check my test choice**. None changes a file, installs anything, or runs the student's analysis. The setting `auraR.copilotTools` (`auto` by default) turns them on for MC 451 and MC 501 and off for MC 427, whose course rules do not let Agent mode run anything. The companion works the same with Copilot off. Needs VS Code 1.95 or newer.
- **MC 427 Test menu as a cross-check.** In MC 427 the R4 heading reads "a check on Copilot's code", and after a test block is inserted a notification says Copilot writes the Module 5 analysis code and a difference is logged as a Copilot error caught. The setting `auraR.mc427TestMenu` (`cross-check` by default) drops the reminder.
- **Charts in Quarto get a `fig-alt` line.** Quarto does not read the alt text in `labs(alt = ...)`, so a bar chart, histogram, or boxplot written into a new Quarto chunk also gets a `#| fig-alt:` option for the same sentence. Inside an existing chunk, a notification says to add one.
- `effectsize` is required in MC 451 and MC 501, as it is in MC 427: the plain tests the Test menu writes call it.
- The data viewer follows dark themes. AG Grid's own defaults, injected after the extension's styles, kept the grid white in a dark theme, which left the coding column dark text on a dark tint. Buttons in both webviews use a slightly darker shade of the theme's button color in dark themes, so their text clears the 5:1 contrast floor (Dark Modern's own blue is 4.53:1).
- **Insert rebuild code** puts the code inside an R chunk when the open file is a Quarto document; it used to land in the prose.
- Verification: the 84 golden blocks byte-identical and Rscript-clean on v2v 0.3.3; the 15 APA blocks run through Rscript and match the numbers in the golden filled sentences; an R3 and R4 command-API suite in a real VS Code.

## 0.3.1

- The data viewer and coding sheet of 0.3.0, built on 0.2.1: v2v 0.3.3 or newer for MC 451 and MC 501, and the Count, filter, and select fixes listed under 0.2.1.

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
