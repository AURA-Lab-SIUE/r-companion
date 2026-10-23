// The error explainer table.
//
// Each entry maps a message students actually see to a plain-English fix and a help link.
// Sources: the failure headings on the v2v-hub pages install-r, install-v2v, install-quarto,
// install-vscode, github-setup, and fix-it (aura-lab.siue.edu/v2v-hub/resources/, section ids
// verified live 2026-10-19), the public workbook chapters 04/05/06, the "Messages you will meet"
// table in the MC 427 Module 5 R00 page and R Field Guide, the MC 451/501 "Common Errors Today"
// deck slides (s21, s22, s24, s26; w11, w12, w13), and the `?v2v::common_errors` catalog.
// Every pattern was reproduced in R 4.6.1 where R or the tool prints the text; the symptom-only
// entries (year-50,888 dates, all-NA joins, low kappa, row count grew, NA mean) match the
// distinctive output a student pastes.
// Links use the canonical aura-lab.siue.edu domain, never the github.io mirror.
// An entry links only to a section that discusses its message. No public page covers object or
// column not found, the \U path, = for ==, or log of zero, so those entries carry their fix steps alone.
// Pure: no VS Code API, so the unit tests load it directly.

import { CourseId } from './profiles';

export interface ErrorEntry {
  id: string;
  /** Matched against the pasted message, case-insensitive. */
  pattern: RegExp;
  title: string;
  /** What is going on, in one or two sentences. */
  why: string;
  /** What to do, as short steps. */
  fix: string[];
  /** Help page. */
  link?: { label: string; url: string };
  /** Courses this entry applies to; all courses when absent. */
  courses?: CourseId[];
  /** A fix the extension can make itself, offered as a button beside the explanation (0.5.3). */
  fixIt?: FixIt;
}

/** The fixes the extension can make for the student, with the button label each shows. */
export type FixIt = 'turn-off-bracketed-paste' | 'close-r-and-install' | 'update-r-extension' | 'connect-r';

export const FIX_IT_LABEL: Record<FixIt, string> = {
  'turn-off-bracketed-paste': 'Turn off bracketed paste for this folder',
  'close-r-and-install': 'Close R terminals and install again',
  'update-r-extension': 'Update the R extension',
  'connect-r': 'Install what R needs to connect',
};

const HUB = 'https://aura-lab.siue.edu/v2v-hub/resources';
const WB = 'https://aura-lab.siue.edu/v2v-hub/workbook';
const V2V: CourseId[] = ['mc451', 'mc501'];

export const ERROR_TABLE: ErrorEntry[] = [
  {
    id: 'bracketed-paste',
    pattern: /\[20[01]~|\x1b\[20[01]~/,
    title: 'Stray characters around your code ([200~ and [201~)',
    why: 'A setting sends your code in a format meant for a different R console. Plain R prints the markers as text and then waits for a command that never finishes, so the next chunk joins onto this one.',
    fix: [
      'Open Settings (Ctrl+, on Windows, Cmd+, on a Mac) and click the Workspace tab.',
      'Search for bracketed and untick R: Bracketed Paste.',
      'Close the R terminal with the bin icon. The next Run opens a clean one.',
    ],
    link: { label: 'Fix It, section 1', url: 'https://aura-lab.siue.edu/v2v-hub/resources/fix-it.html#do-this-one-even-if-nothing-looks-broken' },
    fixIt: 'turn-off-bracketed-paste',
  },
  {
    // vscode-R 3.0 and newer attaches R through its bundled R package sess, which it asks to install
    // the first time R opens. Skipped, Not now, Don't ask again (which declines every later request
    // without asking), or a failed install of sess's imports leaves R "not attached" (toggled on
    // Pythia 2026-10-23, vscode-R 3.2.0 and R 4.6.1). Before 3.0.0 vscode-R never attaches to R 4.6
    // (issues 1696 and 1723), and .vsc.attach() belongs to those versions only. The ECONNRESET half
    // is the language server process dying (languageserver issues 585 and 677), so the steps cover
    // both helpers.
    id: 'r-not-attached',
    pattern: /R: \(not attached\)|Connection to server got closed|read ECONNRESET|could not find function ["'‘’]?\.vsc\.attach/i,
    title: "'R: (not attached)' or 'Connection to server got closed' in VS Code",
    why: 'R still runs your code, but VS Code is not connected to it, so the Workspace panel and plots stay empty. The R extension connects through a small helper package called sess, which it offers to install the first time R opens; if that was skipped, answered with Not now or Don\'t ask again, or failed, R stays not attached. "Connection to server got closed" is a second helper, languageserver, which powers code completion.',
    fix: [
      'Look under the bell at the bottom right of VS Code. If the R extension asks to install bundled sess, choose Install bundled sess, then close the R terminal with the bin icon and open a new one.',
      'No question there, or you chose Don\'t ask again? Quit VS Code completely. Open R on its own (R x64 from the Start menu, or the R app on a Mac) and run: install.packages(c("processx", "later", "jsonlite", "rstudioapi", "languageserver")). If R asks whether to compile from source, answer No.',
      'Open VS Code again, open your course folder, and run AURA: Check my setup. If the sess line is not OK, choose Install what is missing.',
      'An R terminal that is already open can connect without restarting: type sess::connect() in it.',
      'If your R extension version starts with 2, update it in the Extensions view (Ctrl+Shift+X, Cmd+Shift+X on a Mac). Only those older versions use .vsc.attach().',
    ],
    fixIt: 'connect-r',
  },
  {
    id: 'v2v-not-available',
    pattern: /package ['‘’"]?v2v['‘’"]? is not available/i,
    title: "package 'v2v' is not available",
    why: 'install.packages() only looks on CRAN, and the course package lives on GitHub.',
    fix: ['Run AURA: Install what is missing, or run: remotes::install_github("AURA-Lab-SIUE/v2v-r", upgrade = "never")'],
    link: { label: 'Installing the v2v package', url: `${HUB}/install-v2v.html#package-v2v-is-not-available` },
    courses: V2V,
  },
  {
    id: 'v2v-restored',
    pattern: /cannot remove prior installation of package|Warning: restored/i,
    title: 'cannot remove prior installation of package',
    why: 'R tried to update a package that was open at the time. Windows will not replace an open file, so R put the old version back ("restored" means put back, not repaired).',
    fix: [
      'Quit VS Code completely (Cmd+Q on a Mac).',
      'Open R on its own (R x64 from the Start menu, or the R app on a Mac).',
      'Run: install.packages(c("rlang", "cli", "curl", "xfun", "fs"))',
      'Then run: remotes::install_github("AURA-Lab-SIUE/v2v-r", upgrade = "never")',
    ],
    link: { label: 'Fix It, section 3', url: 'https://aura-lab.siue.edu/v2v-hub/resources/fix-it.html#r-says-there-is-no-package-called-v2v' },
    fixIt: 'close-r-and-install',
  },
  {
    id: 'no-package-v2v',
    pattern: /there is no package called ['‘’"]?v2v['‘’"]?/i,
    title: "there is no package called 'v2v'",
    why: 'The install did not finish, even if it looked like it did.',
    fix: [
      'Run AURA: Check my setup. It shows whether v2v is installed and can install it.',
      'If an earlier install printed "Warning: restored", follow Fix It, section 3.',
    ],
    link: { label: 'Installing the v2v package', url: `${HUB}/install-v2v.html#there-is-no-package-called-v2v` },
    courses: V2V,
  },
  {
    id: 'no-package',
    pattern: /there is no package called ['‘’"]?([A-Za-z0-9.]+)['‘’"]?/i,
    title: 'there is no package called ...',
    why: 'The package is not installed in the R that ran this line, or its install did not finish.',
    fix: ['Run AURA: Check my setup, then Install what is missing.', 'You install a package once, not every week.'],
    link: { label: 'Install R for VS Code, Step 4', url: `${HUB}/install-r.html#step-4-install-the-course-packages` },
  },
  {
    id: 'not-available-version',
    pattern: /package ['‘’"]?[A-Za-z0-9.]+['‘’"]? is not available \(for R version/i,
    title: 'package ... is not available (for R version ...)',
    why: 'Your R is too old for the current version of this package.',
    fix: ['Install the current R from cloud.r-project.org, then run AURA: Check my setup again.'],
    link: { label: 'Install R for VS Code', url: `${HUB}/install-r.html#step-1-install-r` },
  },
  {
    id: 'rate-limit',
    pattern: /HTTP error 403|API rate limit exceeded/i,
    title: 'HTTP error 403 or API rate limit exceeded',
    why: 'GitHub limits anonymous downloads per network address. On campus wifi a whole class shares one address.',
    fix: [
      'Wait an hour and try again, or',
      'Sign in to GitHub from R: install.packages("gitcreds"), then gitcreds::gitcreds_set(), and paste a token with no scopes.',
    ],
    link: { label: 'Installing the v2v package', url: `${HUB}/install-v2v.html#http-error-403-or-api-rate-limit-exceeded` },
  },
  {
    id: 'needs-compilation',
    pattern: /needs compilation|Rtools is required|make: not found|xcrun: error|compilation failed/i,
    title: 'The install needs to compile something',
    why: 'R is trying to build a package from source, which needs build tools most laptops do not have.',
    fix: [
      'If R asks "Do you want to install from sources the package which needs compilation?", answer no.',
      'Still failing? Windows: install Rtools matching your R version. Mac: run xcode-select --install in Terminal.',
    ],
    link: { label: 'Installing the v2v package', url: `${HUB}/install-v2v.html#the-install-needs-to-compile-something` },
  },
  {
    id: 'file-in-use',
    pattern: /file is in use|being used by another process|Permission denied.*\.dll|cannot open file .*\.dll/i,
    title: 'file is in use (Windows)',
    why: 'Another R session has the package open, and Windows will not overwrite an open file.',
    fix: [
      'Close every other R and VS Code window, then install again.',
      'If it persists, run R: Restart R Session from the Command Palette and try again.',
    ],
    link: { label: 'Installing the v2v package', url: `${HUB}/install-v2v.html#file-is-in-use-on-windows` },
    fixIt: 'close-r-and-install',
  },
  {
    id: 'help-corrupt',
    pattern: /installed help of package .* is corrupt|is corrupt\b.*help/i,
    title: "installed help of package 'v2v' is corrupt",
    why: 'The package works, but its help files did not install cleanly.',
    fix: [
      'Run: remotes::install_github("AURA-Lab-SIUE/v2v-r", force = TRUE, upgrade = "never")',
      'Then restart R. Help loads once per session.',
    ],
    link: { label: 'Installing the v2v package', url: `${HUB}/install-v2v.html#installed-help-of-package-v2v-is-corrupt` },
  },
  {
    id: 'could-not-find-function',
    pattern: /could not find function ["“”']?([A-Za-z0-9._]+)/i,
    title: 'could not find function ...',
    why: "The function's package is not loaded, or the name is misspelled.",
    fix: [
      'Run the library() line at the top of your script first, for example library(tidyverse).',
      'For effect sizes in MC 427, write effectsize::cohens_d(), with the effectsize:: in front.',
      'Check the spelling and capital letters.',
    ],
    link: { label: 'Install R for VS Code: common issues', url: `${HUB}/install-r.html#could-not-find-function` },
  },
  {
    id: 'r-not-recognized',
    pattern: /'R' is not recognized|R: command not found|command not found: R\b|The term 'R' is not recognized/i,
    title: 'Command not found: R',
    why: 'On Windows this is normal: the R installer leaves R off the command line on purpose. R still works and VS Code still finds it.',
    fix: [
      'Use AURA: Check my setup instead of R --version. It finds R through the registry.',
      'On a Mac or Linux, restart the computer; if it persists, use the full path /usr/local/bin/R.',
    ],
    link: { label: 'Install R for VS Code', url: `${HUB}/install-r.html#command-not-found-r` },
  },
  {
    id: 'cannot-open-file',
    pattern: /cannot open file ['‘’"]?([^'‘’"]+)['‘’"]?: No such file or directory|does not exist in current working directory/i,
    title: 'cannot open file: No such file or directory',
    why: 'R looks for files in the folder VS Code has open. The file is not there, or the name is spelled differently.',
    fix: [
      'Check the spelling against the file list on the left.',
      'Run list.files() to see what R can see. If the file is missing, move it into the folder, or open the right folder with File, then Open Folder, and start a new R terminal.',
    ],
  },
  {
    id: 'cran-mirror',
    pattern: /Secure CRAN mirrors|--- Please select a CRAN mirror|trying to use CRAN without setting a mirror/i,
    title: 'R shows a long list of countries and cities',
    why: 'R is asking which download site to use.',
    fix: ['Type the number next to 0-Cloud and press Enter.', 'AURA: Install what is missing sets the site for you, so you never see this list.'],
    link: { label: 'Install R for VS Code', url: `${HUB}/install-r.html#install.packages-seems-stuck` },
  },
  {
    id: 'personal-library',
    pattern: /Would you like to use a personal library|Would you like to create a personal library/i,
    title: 'Would you like to use a personal library instead?',
    why: 'R cannot write to its system folder, so it offers a folder in your user account.',
    fix: ['Type yes each time it asks.', 'AURA: Install what is missing creates that folder for you.'],
  },
  {
    id: 'update-prompt',
    pattern: /These packages have more recent versions available|Enter one or more numbers, or an empty line to skip updates/i,
    title: 'These packages have more recent versions available',
    why: 'R offers to update other packages mid-install. Updating mid-semester is how a working setup breaks.',
    fix: ['Type 3 and press Enter, or press Enter on an empty line, to skip updates.'],
    link: { label: 'Installing the v2v package', url: `${HUB}/install-v2v.html#prompts-you-will-see-and-what-to-answer` },
  },
  {
    id: 'object-r-not-found',
    pattern: /object ['‘’"]r['‘’"] not found/i,
    title: "object 'r' not found after library(v2v-r)",
    why: 'The repository is called v2v-r, but the package is called v2v. R reads the hyphen as minus.',
    fix: ['Write library(v2v).'],
    link: { label: 'Installing the v2v package', url: `${HUB}/install-v2v.html#the-one-thing-that-confuses-everyone` },
    courses: V2V,
  },
  {
    id: 'git-clone-missing',
    pattern: /Git: Clone|git.*not recognized|'git' is not recognized|git: command not found/i,
    title: 'Git: Clone is missing, or git is not recognized',
    why: 'VS Code looks for Git once, when it starts. Git installed while VS Code was open stays invisible to it.',
    fix: [
      'Quit VS Code completely and open it again (Reload Window is not enough).',
      'Still missing on Windows? Reinstall Git from git-scm.com and choose the middle PATH option.',
    ],
    link: { label: 'Fix It, section 2', url: 'https://aura-lab.siue.edu/v2v-hub/resources/fix-it.html#git-clone-is-not-in-the-command-palette' },
  },
  {
    id: 'plus-prompt',
    pattern: /^\s*\+\s*$/m,
    title: 'A + instead of >',
    why: 'R is waiting for you to finish a line, usually a missing closing bracket or quotation mark.',
    fix: ['Click in the R terminal and press Esc to get the > back, then run the line again.'],
  },

  // ---- Phase 2 additions: the 30 course messages the explainer did not cover ----

  // Priority 1: the single most frequent message, and the column twin, every course.
  {
    id: 'object-not-found',
    pattern: /object ['‘’"]?([A-Za-z0-9._]+)['‘’"]? not found/i,
    title: "object '...' not found",
    why: 'R has no value stored under that name. Either the line that would create it never ran, the name is misspelled, or a text value was typed without quotation marks (R then reads the word as a name).',
    fix: [
      'If it is a data frame like df, run the read_csv line that creates it first, then the line that failed.',
      'Check the spelling and capital letters against the name you assigned with <-.',
      'If it is a word that should be text, put it in quotation marks, for example share_button == "yes".',
    ],
  },
  {
    id: 'column-not-found',
    pattern: /[Cc]an't (?:select|subset|rename) columns that don't exist|[Cc]olumn ['‘’"`]?[^'‘’"`\n]+['‘’"`]? (?:doesn't exist|is not found)|Must group by variables found/i,
    title: "Column '...' doesn't exist",
    why: 'You named a column that is not in the data frame, usually a spelling or capitalization slip. R and the tidyverse print this two ways: "Can\'t select columns that don\'t exist" / "Column `x` doesn\'t exist" from select(), and "Column `x` is not found" from count() or group_by().',
    fix: [
      'Run glimpse(df) or names(df) and compare the column name letter for letter.',
      'Copy the name from that list instead of retyping it; watch for capital letters and underscores.',
    ],
  },

  // Priority 2: the other MC 427 Module 5 R00 messages.
  {
    id: 'backslash-U',
    pattern: /['‘’"]?\\U['‘’"]? used without hex digits/i,
    title: "'\\U' used without hex digits",
    why: 'You pasted a Windows path copied from File Explorer. Its backslashes mean something special to R, so a path like "C:\\Users\\data.csv" breaks before the file is ever read.',
    fix: [
      'Do not paste a path from File Explorer. Open the folder in VS Code (File, then Open Folder), put the data file inside it, and read it by name: read_csv("data.csv").',
      'If you must write a path, use forward slashes: "C:/Users/data.csv".',
    ],
  },
  {
    id: 'named-input-equals',
    pattern: /We detected a named input|Did you mean .*==/i,
    title: 'We detected a named input (= where == belongs)',
    why: 'Inside filter() one equals sign names an argument; two equals signs ask a question. You wrote one where you meant to compare, so the tidyverse stops and asks.',
    fix: ['Change the single = to == inside filter(), for example filter(update == "Beyond").'],
  },
  {
    id: 'log-of-zero',
    pattern: /NA\/NaN\/Inf in ['‘’"]?[yx]['‘’"]?|NaNs produced/i,
    title: 'NaN, -Inf, or NA/NaN/Inf from the log of zero',
    why: 'log(0) is -Inf and log of a negative number is NaN. When those values flow into a test or model, R prints "NaNs produced" or stops with "NA/NaN/Inf in \'y\'".',
    fix: [
      'Use log1p() instead of log() for skewed counts: it computes log(1 + x), so a zero becomes 0 rather than -Inf.',
      'In MC 427 the Module 5 pages write mutate(log_likes = log1p(like_count)).',
    ],
  },
  {
    // The R00 table's first form of the log of zero: the t-test runs and prints NaN and -Inf
    // instead of stopping (R 4.6.1, t.test() and broom::tidy() on log() of a count with zeros).
    id: 't-test-nan-inf',
    pattern: /t = NaN, df = NaN|mean in group \S+\s+mean in group \S+\s+-Inf|NaN\s+-Inf\s+-Inf\s+NaN/i,
    title: 't-test prints t = NaN and group means of -Inf',
    why: 'A group mean of -Inf means the outcome holds the log of zero: log(0) is -Inf. One -Inf makes the group mean -Inf, so the t-test has nothing to compare and prints NaN, and Cohen\'s d comes back empty.',
    fix: [
      'Use log1p() instead of log() for skewed counts: it computes log(1 + x), so a zero becomes 0 rather than -Inf.',
      'In MC 427 the Module 5 pages write mutate(log_likes = log1p(like_count)).',
      'Run the mutate() line again, then the t-test.',
    ],
  },
  {
    // MC 427 R Field Guide C11 (R 4.6.1): mean() on a text column inside summarize(), or on its own.
    id: 'mean-not-numeric',
    pattern: /argument is not numeric or logical(?:: returning NA)?/i,
    title: 'argument is not numeric or logical: returning NA',
    why: 'This is a warning: mean() was given a text column, so it returned NA. The values can look like numbers (for example +186.23%) and still be stored as text, because of the plus sign or the percent sign.',
    fix: [
      'Run glimpse() on your data and look at the column type: <chr> means text, <dbl> or <int> means numbers.',
      'Work from a number column instead, such as avg_players.',
      'If you need this column as a number, convert it first: mutate(pct = parse_number(pct_gain)) turns "+186.23%" into 186.23.',
    ],
  },
  {
    id: 'chisq-approximation',
    pattern: /Chi-squared approximation may be incorrect/i,
    title: 'Chi-squared approximation may be incorrect',
    why: 'This is a warning, not an error: the test ran and the result printed. It means some expected cell counts are under 5, so the p-value is approximate.',
    fix: [
      'Keep the result. Report the warning in your verification log.',
      'If several cells are small, say so in your write-up; the effect size (Cramer\'s V) still stands.',
    ],
    link: { label: 'Workbook: run the chi-square test', url: `${WB}/06-inferencing-data.html#step-3-run-the-chi-square-test` },
  },

  // Wrangling and test syntax (MC 451/501 deck error slides; general R).
  {
    id: 'unexpected-equals',
    pattern: /unexpected '='/i,
    title: "unexpected '='",
    why: 'R could not parse the line. This is almost always a single = where two were needed to compare, or a stray = in the wrong place.',
    fix: ['Look for = where you meant ==, and fix the line.', 'If the line looks right, check the one above it for a missing comma or bracket.'],
  },
  {
    id: 'slice-max-order-by',
    pattern: /`order_by` is absent but must be supplied|slice_max\(\)[^\n]*order_by/i,
    title: 'slice_max(): order_by is absent but must be supplied',
    why: 'slice_max() needs to know which column to rank by. For a per-group top value you also need group_by() first, or it ranks across the whole table.',
    fix: [
      'Name the column to rank: slice_max(count, n = 1).',
      'For the top value in each group, pipe group_by(channel) %>% before slice_max().',
    ],
    link: { label: 'Workbook: check categorical variables', url: `${WB}/04-data-wrangling.html#check-categorical-variables` },
  },
  {
    id: 't-test-two-levels',
    pattern: /must have exactly 2 levels/i,
    title: 'grouping factor must have exactly 2 levels',
    why: 'A t-test compares exactly two groups. The grouping column has three or more values, or it has NAs that R counts as a level.',
    fix: [
      'Run count() on the grouping column to see its values.',
      'Keep two groups with filter(), for example filter(group %in% c("a", "b")), or drop the NAs, then run the test again.',
    ],
    link: { label: 'Workbook: the t-test', url: `${WB}/06-inferencing-data.html#when-the-outcome-is-continuous-the-t-test` },
  },
  {
    id: 'not-enough-observations',
    pattern: /not enough ['‘’"]?[xy]['‘’"]? observations/i,
    title: "not enough 'x' observations",
    why: 'A group has too few rows for the test, usually because a filter left almost nothing behind.',
    fix: [
      'Run count() on the grouping column to see how many rows each group has.',
      'Loosen the filter, or pick groups that have enough data.',
    ],
    link: { label: 'Workbook: the t-test', url: `${WB}/06-inferencing-data.html#when-the-outcome-is-continuous-the-t-test` },
  },
  {
    id: 'na-mean',
    pattern: /^\s*\[1\]\s+NA\s*$/m,
    title: 'mean() or sd() prints NA',
    why: 'A single missing value makes mean(), median(), and sd() return NA, because R will not quietly average around a hole.',
    fix: [
      'Add na.rm = TRUE: mean(x, na.rm = TRUE).',
      'Then ask why the values are missing; a missing value is sometimes a wrangling mistake worth fixing at the source.',
    ],
    link: { label: 'Workbook: the summary table', url: `${WB}/05-describing-data.html#the-summary-table-behind-the-picture` },
  },
  {
    id: 'ggplot-missing-plus',
    pattern: /(?:ggplot\s*\(|geom_[A-Za-z_]+)[\s\S]*?unexpected symbol|unexpected symbol[\s\S]*?geom_[A-Za-z_]+/i,
    title: 'A ggplot layer with a missing +',
    why: 'Every ggplot layer is joined by a + at the end of the line above it. A missing + makes R read the next geom_ as a surprise; a trailing + with nothing after it leaves R waiting (you see a + prompt).',
    fix: [
      'Put a + at the end of every line except the last in a ggplot block.',
      'Make sure the last line has no trailing +. If the terminal shows a +, click in it and press Esc.',
    ],
    link: { label: 'Workbook: the grammar of graphics', url: `${WB}/05-describing-data.html#the-grammar-of-graphics-ggplot2` },
  },

  // The five `?v2v::common_errors` cases (MC 451 and MC 501 only).
  {
    id: 'epoch-ms-year-50888',
    pattern: /\b[45]\d{4}-\d{2}-\d{2}\b/,
    title: 'Timestamps land in the year 50,888',
    why: 'The date column is Unix time in milliseconds, but as.POSIXct() expects seconds, so every time is a thousand times too large and lands tens of thousands of years in the future.',
    fix: [
      'Use clean_dates(): mutate(ts = clean_dates(date)).',
      'By hand it is a divide by 1000 first: as.POSIXct(date / 1000, origin = "1970-01-01").',
    ],
    link: { label: 'Workbook: make the timestamp readable', url: `${WB}/04-data-wrangling.html#a-make-the-timestamp-readable` },
    courses: V2V,
  },
  {
    id: 'join-all-na',
    pattern: /join (?:produces|returns)[\s\S]{0,50}(?:zero|all|no)[\s\S]{0,20}(?:NA|matched|rows)|every joined column[\s\S]{0,10}NA|mismatched keys/i,
    title: 'A join returns zero rows, or every joined column is NA',
    why: 'The join key does not match between the two tables. In the Twitch data the chat channel is prefixed with a # (an IRC convention) and the stream channel is not, so no row lines up.',
    fix: [
      'Compare the key columns: the shipped twitch_chat_sample has the # already stripped, so the join works as-is.',
      'If you pulled raw data, normalize first: mutate(channel = sub("^#", "", channel)) before the join.',
    ],
    link: { label: 'Workbook: match each message to its stream', url: `${WB}/04-data-wrangling.html#c-match-each-message-to-its-stream` },
    courses: V2V,
  },
  {
    id: 'row-count-grew-after-join',
    pattern: /row count grew|(?:more|extra) rows after[\s\S]{0,15}join|join[\s\S]{0,30}duplicate keys/i,
    title: 'The row count grew after a join',
    why: 'A left_join() should keep one row per chat message. If the row count goes up, the lookup table has duplicate keys, so each chat row matches more than one lookup row.',
    fix: [
      'Check the lookup for duplicates: lookup %>% count(channel) %>% filter(n > 1).',
      'Keep one row per key with distinct(channel, .keep_all = TRUE) before the join, then join again and confirm nrow() is unchanged.',
    ],
    link: { label: 'Workbook: match each message to its stream', url: `${WB}/04-data-wrangling.html#c-match-each-message-to-its-stream` },
    courses: V2V,
  },
  {
    id: 'setup-quarto-false-alarm',
    pattern: /Quarto CLI not found|setup\(\)[\s\S]{0,40}[Qq]uarto[\s\S]{0,20}missing|[Qq]uarto[\s\S]{0,15}missing but[\s\S]{0,15}installed/i,
    title: 'setup() says Quarto is missing, but you have it installed',
    why: 'R reads the PATH once, when it starts. If R was already open when Quarto was installed, that session cannot see Quarto even though the terminal can.',
    fix: [
      'Quit R, open it again, and run v2v::setup() once more.',
      'If the red x stays, reinstall Quarto from quarto.org. The quarto R package is a separate optional wrapper and does not install the program.',
    ],
    link: { label: 'Installing Quarto: open a new terminal', url: `${HUB}/install-quarto.html#step-2-close-your-terminal-and-open-a-new-one` },
    courses: V2V,
  },
  {
    id: 'kappa-lower-than-expected',
    pattern: /kappa[\s\S]{0,40}(?:lower than (?:I )?expected|much lower|near 0|is .{0,10}low)|low(?:er)? (?:than expected )?kappa/i,
    title: "Cohen's kappa is much lower than you expected",
    why: 'Kappa corrects for chance agreement. When one code is rare, two coders can agree most of the time on the common code and still score a low kappa, because the agreement on the rare code is what carries the signal.',
    fix: [
      'Revise the codebook so the rare code is defined more sharply and appears more often, or',
      'Report Krippendorff\'s alpha with reliability(method = "alpha"), which handles an imbalanced code better.',
    ],
    link: { label: 'Workbook: the codebook', url: `${WB}/01-codebook.html` },
    courses: V2V,
  },
  {
    id: 'twitch-sample-not-found',
    pattern: /data set ['‘’"]?twitch_chat_sample['‘’"]? not found|twitch_chat_sample[^\n]*not found/i,
    title: "data set 'twitch_chat_sample' not found",
    why: 'Either the v2v package is not installed, or you called data() before library(v2v).',
    fix: [
      'Run library(v2v) first, then try again.',
      'If it still fails, reinstall: remotes::install_github("AURA-Lab-SIUE/v2v-r", upgrade = "never", force = TRUE). v2v is not on CRAN, so install.packages() cannot find it.',
    ],
    link: { label: 'Installing the v2v package: when it fails', url: `${HUB}/install-v2v.html#when-it-fails` },
    courses: V2V,
  },

  // Quarto and Git/GitHub (publishing and setup; all courses).
  {
    id: 'quarto-command-not-found',
    pattern: /quarto: command not found|['‘’"]?quarto['‘’"]? is not recognized/i,
    title: "quarto: command not found",
    why: 'The Quarto program is not installed, or the terminal was open before it was installed and has not picked it up yet.',
    fix: [
      'Close the terminal and open a new one, then run quarto check.',
      'If it still fails, install Quarto from quarto.org and open a fresh terminal.',
    ],
    link: { label: 'Installing Quarto: command not found', url: `${HUB}/install-quarto.html#quarto-command-not-found-or-quarto-is-not-recognized` },
  },
  {
    id: 'quarto-check-no-r',
    pattern: /quarto check[\s\S]{0,30}R (?:was )?not found|quarto check[\s\S]{0,30}could not find R/i,
    title: 'quarto check says R was not found',
    why: 'Quarto looks for R on the PATH. On Windows the R installer leaves R off the PATH on purpose, so quarto check can report R missing even though R works in VS Code.',
    fix: [
      'This does not mean R is broken. Confirm R with AURA: Check my setup.',
      'Render from inside VS Code with the R extension active, which hands Quarto the right R.',
    ],
    link: { label: 'Installing Quarto: quarto check says R not found', url: `${HUB}/install-quarto.html#quarto-check-says-r-was-not-found` },
  },
  {
    id: 'failed-to-spawn-rscript',
    pattern: /Failed to spawn ['‘’"]?Rscript/i,
    title: "Failed to spawn 'Rscript'",
    why: 'Quarto tried to run R to render a code chunk but could not find Rscript.',
    fix: [
      'Run AURA: Check my setup to confirm R is found, then render again from inside VS Code.',
      'Close the terminal and open a new one so it picks up the current PATH.',
    ],
    link: { label: 'Installing Quarto: Failed to spawn Rscript', url: `${HUB}/install-quarto.html#error-failed-to-spawn-rscript` },
  },
  {
    id: 'yaml-render-error',
    pattern: /\byaml\b|_quarto\.yml|did not find expected key|mapping values are not allowed here/i,
    title: 'Render fails with a YAML error',
    why: 'The block of settings at the top of your .qmd, between the --- lines, is misread. YAML is strict about spaces and colons.',
    fix: [
      'Check the lines between the two --- for a missing space after a colon (title: My Report, not title:My Report).',
      'Keep every key flush left unless it belongs under another key, and indent with spaces, never tabs.',
    ],
    link: { label: 'Installing Quarto: YAML error', url: `${HUB}/install-quarto.html#render-fails-with-a-yaml-error` },
  },
  {
    id: 'unc-share',
    pattern: /drive or UNC share does not exist|UNC (?:path|share) /i,
    title: 'The installer says the drive or UNC share does not exist',
    why: 'A tool is pointed at a network or OneDrive path that is not reachable, often because the working folder is on a synced drive that is offline.',
    fix: [
      'Work from a plain local folder, for example C:\\Users\\you\\MC427, not a mapped network drive.',
      'If your Documents folder is in OneDrive, move the course folder somewhere local and open that in VS Code.',
    ],
    link: { label: 'Installing VS Code: drive or UNC share', url: `${HUB}/install-vscode.html#the-installer-says-the-drive-or-unc-share-does-not-exist` },
  },
  {
    id: 'permission-denied-publickey',
    pattern: /Permission denied \(publickey\)/i,
    title: 'Permission denied (publickey)',
    why: 'Git tried to reach GitHub over SSH, but GitHub does not recognize a key for you. This course uses HTTPS, so the SSH key is the wrong road.',
    fix: [
      'Clone with the https:// address, not the git@github.com: address.',
      'When Git asks you to sign in, use the browser sign-in or a personal access token, not an SSH key.',
    ],
    link: { label: 'GitHub setup: Permission denied', url: `${HUB}/github-setup.html#permission-denied-error` },
  },
  {
    id: 'author-identity-unknown',
    pattern: /Author identity unknown|empty ident name|please tell me who you are/i,
    title: 'Author identity unknown',
    why: 'Git will not record a commit until it knows your name and email, and this is the first commit on this computer.',
    fix: [
      'Set them once: git config --global user.name "Your Name" and git config --global user.email "you@example.com".',
      'Then commit again.',
    ],
    link: { label: 'GitHub setup: tell Git who you are', url: `${HUB}/github-setup.html#tell-git-who-you-are` },
  },
  {
    id: 'repository-not-found',
    pattern: /Repository not found/i,
    title: 'Repository not found',
    why: 'The repository address is wrong, the repo is private and you are not signed in, or you do not have access.',
    fix: [
      'Check the address against the green Code button on the GitHub page; copy it rather than typing it.',
      'Sign in to GitHub in VS Code if the repo is private or belongs to the course organization.',
    ],
    link: { label: 'GitHub setup: clone a repository', url: `${HUB}/github-setup.html#step-4-clone-a-repository-get-it-on-your-computer` },
  },
  {
    id: 'merge-conflict',
    pattern: /merge conflict|CONFLICT \(content\)|Automatic merge failed|<<<<<<< HEAD/i,
    title: 'Merge conflict',
    why: 'The same lines changed in two places, so Git cannot decide which to keep and marks the spot for you.',
    fix: [
      'Open the file. Git marked the clash with <<<<<<<, =======, and >>>>>>>.',
      'Delete the markers, keep the lines you want, save, then commit again.',
    ],
    link: { label: 'GitHub setup: troubleshooting', url: `${HUB}/github-setup.html#step-8-troubleshooting` },
  },
  {
    id: 'large-files',
    pattern: /GH001|[Ll]arge files? detected|exceeds GitHub's (?:recommended )?(?:maximum )?file size|this exceeds GitHub|this is larger than GitHub's recommended/i,
    title: 'GitHub rejects or warns about large files',
    why: 'GitHub refuses files over 100 MB and warns over 50 MB. A big data file or a rendered output was committed by mistake.',
    fix: [
      'Keep raw data and large rendered files out of the repo; commit the code and the small inputs.',
      'Add the file to .gitignore, remove it from the commit, and push again. Ask for help before rewriting history.',
    ],
    link: { label: 'GitHub setup: troubleshooting', url: `${HUB}/github-setup.html#step-8-troubleshooting` },
  },
];

export interface Explanation {
  entry: ErrorEntry;
  /** The matched text, to show the student which part was recognized. */
  matched: string;
}

/** All entries that match, most specific first (table order), filtered to the course. */
export function explain(text: string, course?: CourseId): Explanation[] {
  const out: Explanation[] = [];
  const seenGeneric = new Set<string>();
  for (const entry of ERROR_TABLE) {
    if (course && entry.courses && !entry.courses.includes(course)) continue;
    const m = entry.pattern.exec(text);
    if (!m) continue;
    // The specific v2v entries already cover the generic "no package" message
    if (entry.id === 'no-package' && out.some((e) => e.entry.id === 'no-package-v2v' || e.entry.id === 'v2v-restored')) continue;
    // The specific library(v2v-r) hyphen case already covers the generic "object not found"
    if (entry.id === 'object-not-found' && out.some((e) => e.entry.id === 'object-r-not-found')) continue;
    // A text column already explains the [1] NA that mean() printed beside its warning
    if (entry.id === 'na-mean' && out.some((e) => e.entry.id === 'mean-not-numeric')) continue;
    // .vsc.attach is vscode-R's own function: the not-attached entry, not a package to load
    if (entry.id === 'could-not-find-function' && out.some((e) => e.entry.id === 'r-not-attached')) continue;
    if (seenGeneric.has(entry.id)) continue;
    seenGeneric.add(entry.id);
    out.push({ entry, matched: m[0] });
  }
  return out;
}

/** Escape Markdown punctuation so R code, paths, and Git's <<<<<<< markers show as typed. */
function mdText(s: string): string {
  return s.replace(/[\\`*_{}[\]()<>#+\-.!|~]/g, (c) => '\\' + c);
}

/**
 * Text the student pasted, as one line of inline code, with delimiters longer than any backtick run
 * in it (and a space inside them when it starts or ends with a backtick).
 */
function inlineCode(s: string): string {
  const one = s.replace(/\s+/g, ' ').trim();
  const longest = Math.max(0, ...(one.match(/`+/g) ?? []).map((r) => r.length));
  const ticks = '`'.repeat(longest + 1);
  const pad = one.startsWith('`') || one.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${one}${pad}${ticks}`;
}

/**
 * One explanation as a Markdown page: the title, the part of the message it explains, why, the
 * numbered steps, and the help link. The quick pick truncates every row to one line, so the full
 * text is shown here, in a read-only preview a screen reader reads as headings, a paragraph, and an
 * ordered list (#rgui 0.5.1). The matched text is one short line, so the steps stay near the top.
 */
export function explanationMarkdown(x: Explanation): string {
  const e = x.entry;
  const out = [`# ${mdText(e.title)}`, ''];
  if (x.matched.trim()) out.push(`From your message: ${inlineCode(x.matched)}`, '');
  out.push('## Why this happens', '', mdText(e.why), '');
  out.push('## What to do', '');
  e.fix.forEach((step, i) => out.push(`${i + 1}. ${mdText(step)}`));
  out.push('');
  if (e.fixIt) {
    out.push(
      '## Or let the R Companion do it',
      '',
      `Select **${mdText(FIX_IT_LABEL[e.fixIt])}** in the notification at the bottom right of VS Code.`,
      '',
    );
  }
  if (e.link) out.push('## Read more', '', `[${mdText(e.link.label)}](${e.link.url})`, '');
  out.push(
    '## Still stuck?',
    '',
    'After 15 minutes, email your instructor or come to office hours. Send the exact wording of the message, or a screenshot of the whole console.',
    '',
  );
  return out.join('\n');
}
