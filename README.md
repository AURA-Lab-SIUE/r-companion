# AURA Lab R Companion

A Visual Studio Code extension that gets students new to R to a working setup, built for the R courses taught at Southern Illinois University Edwardsville: MC 427 Social Media Analytics, MC 451 Research Methods, and MC 501 Research Methods (graduate).

R stays visible. The extension finds R, checks what your course needs, installs what is missing, and explains the messages students meet most often. A student whose setup already works does not have to change anything.

## Part of From Vibes to Variables

[From Vibes to Variables (V2V)](https://aura-lab.siue.edu/v2v/) is the AURA Lab's open methods package for teaching media research at Southern Illinois University Edwardsville. Its parts are built to be used together:

- [Textbook](https://aura-lab.siue.edu/v2v/) ([source](https://github.com/AURA-Lab-SIUE/v2v)): the open textbook that carries the arc from research question to published report.
- [Course hub](https://aura-lab.siue.edu/v2v-hub/) ([source](https://github.com/AURA-Lab-SIUE/v2v-hub)): the course website for MC 451 and MC 501 that sequences the textbook, the labs, and the setup guides.
- [v2v R package](https://github.com/AURA-Lab-SIUE/v2v-r): the companion package with the Twitch practice corpus and the helpers the textbook introduces chapter by chapter.
- [Course workspace](https://github.com/AURA-Lab-SIUE/v2v-workspace): the VS Code template students copy for journals, reading notes, and project work.
- [R Companion](https://github.com/AURA-Lab-SIUE/r-companion) (this repository): the VS Code extension that checks each student's R setup, installs what is missing, and explains common R errors.

A sibling template, [mc427-codespace](https://github.com/AURA-Lab-SIUE/mc427-codespace), gives MC 427 Social Media Analytics the same VS Code and R toolchain in a GitHub Codespace; the R Companion serves MC 427 as well, and the v2v package is not used there.

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
- The Describe, plots, and Tests tasks arrive with later releases.

## How it finds R

In order: the `auraR.rPath` setting, the R extension's `r.rpath` and `r.rterm` settings, your PATH, then on Windows the registry and the standard install folders (the Windows R installer leaves R off the PATH on purpose), and on macOS the R.framework and Homebrew locations.

## How it runs R

Inside Positron it uses Positron's console. Where the R extension by REditorSupport is installed, it uses that extension's terminal. Otherwise it opens a plain R terminal with bracketed paste switched off, so the stray `[200~` characters never appear. Package checks use a short-lived `Rscript` process and never touch your R session.

## Privacy

No telemetry. The only network traffic is the CRAN and GitHub downloads you start with Install what is missing. Copies installed from the Visual Studio Marketplace or Open VSX are updated by VS Code itself. A copy installed from a `.vsix` file checks GitHub releases for a newer version only when the `auraR.updates.releaseUrl` setting holds an address; it is empty by default.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `auraR.course` | empty | Your course. Empty means the extension asks once and remembers. |
| `auraR.rPath` | empty | Full path to `Rscript`, when the extension cannot find R by itself. |
| `auraR.cranMirror` | `https://cloud.r-project.org` | Download site for Install what is missing. |
| `auraR.runWith` | `auto` | `auto`, `positron`, `vscode-r`, or `terminal`. |
| `auraR.updates.releaseUrl` | empty | For `.vsix` installs only: the GitHub releases API address to check. |
| `auraR.plainCalls` | on | MC 451 and MC 501: write the plain R calls (`t.test()`, `chisq.test()`, `effectsize`, `irr`) with the `v2v` wrapper last as a check. Off writes the wrappers alone. |
| `auraR.previewReleases` | off | Shows the menu tasks of releases not yet published, for testing. |

## Accessibility

R1 uses only native VS Code interface: the Command Palette, quick picks, notifications, the Output panel, and the Get Started walkthrough. All of it is keyboard-operable and read by screen readers, and it follows your color theme, including high contrast. There is no webview in this release.

## Course pages

- MC 451 and MC 501: [V2V Hub](https://aura-lab.siue.edu/v2v-hub/), including [Install R for VS Code](https://aura-lab.siue.edu/v2v-hub/resources/install-r.html), [Installing the v2v package](https://aura-lab.siue.edu/v2v-hub/resources/install-v2v.html), and [Fix It](https://aura-lab.siue.edu/v2v-hub/resources/fix-it.html).
- MC 427: the course folder template, [AURA-Lab-SIUE/mc427-codespace](https://github.com/AURA-Lab-SIUE/mc427-codespace), and the R Field Guide in Blackboard.

## Development

```
npm install
npm test                    # compiles, then runs the unit tests
npm run check:separation    # fails on any SIM DAD or TASS source
npm run package             # all of the above, then builds dist/r-companion-<version>.vsix
```

This is an AURA Lab project. It contains no SIM DAD LLC or TASS source, and `scripts/check-separation.mjs` fails the build if any appears.

## Adapting this for your course

The extension is built so another course, or another campus, can adopt it by editing a small set of files. All of them are plain TypeScript or Markdown, and `npm test` exercises each one.

1. **Add a course profile** in `src/profiles.ts`. A profile names the course, the minimum R version, and the package list (CRAN or GitHub, required or recommended, with a plain-English "why" shown beside each package). It also declares whether the course needs Quarto and Git, the workspace template students copy, and the help links shown when a check fails. Register the new id in the `CourseId` type and the `COURSE_IDS` list in the same file.
2. **Point the checks at your course's setup script and result line.** If your course grades a setup screenshot, set `setupScript` and `resultLines` in the profile. The `ok` string must match what your script prints character for character; MC 427's `SETUP OK: R and the course packages are working.` line and its `mc427-setup-check.R` script in [mc427-codespace](https://github.com/AURA-Lab-SIUE/mc427-codespace) show the shape.
3. **Extend the error explainer** in `src/errors.ts`. Each entry is a regular expression matched against the pasted message, a plain-English "why," fix steps, a help link, and optionally the courses it applies to.
4. **Generated install code** comes from `src/installScript.ts`, which writes the `install.packages()` script from the profile's package list (CRAN mirror set, binary-only installs on Windows and macOS, a personal library when the system one is not writable). A new profile usually needs no change here.
5. **Copilot instructions** your course hands to students live in `resources/course-files/`; add a file there and name it in the profile's `copilotInstructions` field.
6. **Build a VSIX** with `npm run package`. It runs the separation check and the unit tests, then writes `dist/r-companion-<version>.vsix`, which installs through VS Code's **Install from VSIX** command without any marketplace.

If you publish an adapted build, change `name`, `displayName`, and `publisher` in `package.json` so it does not collide with this extension on the Visual Studio Marketplace or Open VSX.

## License and citation

MIT. See [LICENSE](LICENSE). To cite the extension, use [CITATION.cff](CITATION.cff):

Leith, A. P. (2026). *AURA Lab R Companion* (Version 0.1.0) [Computer software]. AURA Lab, Southern Illinois University Edwardsville. https://github.com/AURA-Lab-SIUE/r-companion
