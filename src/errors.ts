// The first error explainer table.
//
// Each entry maps a message students actually see to a plain-English fix and a help link.
// Sources: the failure headings on the v2v-hub pages install-r, install-v2v, and fix-it
// (aura-lab.siue.edu/v2v-hub/resources/, section ids read 2026-10-18), plus the "Messages
// you will meet" lists in the MC 427 R Field Guide (C1 to C5, C14, C24).
// Links use the canonical aura-lab.siue.edu domain, never the github.io mirror.
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
}

const HUB = 'https://aura-lab.siue.edu/v2v-hub/resources';
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
    if (seenGeneric.has(entry.id)) continue;
    seenGeneric.add(entry.id);
    out.push({ entry, matched: m[0] });
  }
  return out;
}
