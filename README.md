# AURA Lab R Companion

A Visual Studio Code extension that gets students new to R to a working setup, built for the R courses taught at Southern Illinois University Edwardsville: MC 427 Social Media Analytics, MC 451 Research Methods, and MC 501 Research Methods (graduate).

R stays visible. The extension finds R, checks what your course needs, installs what is missing, and explains the messages students meet most often. A student whose setup already works does not have to change anything.

## What it does (release 0.1, "R1 Setup")

- **AURA: Check my setup.** Finds R on your computer and reports, line by line, whether each package your course needs is installed, plus Quarto and Git where the course uses them. For MC 451 and MC 501 it also shows the course package's own check, `v2v::setup()`, as a checklist. Every line carries a status word (OK, MISSING, NEEDS UPDATE, BROKEN, CHECK, NOTE), so nothing depends on color.
- **AURA: Install what is missing.** Runs `install.packages()` with the CRAN mirror already set, into your personal R library when the system one is not writable, and installs the course package `v2v` from GitHub with `remotes::install_github("AURA-Lab-SIUE/v2v-r", upgrade = "never")`, as the course hub's install page does. Then it checks again by asking R what is actually in the library. An exit code is never taken as proof.
- **Get Started walkthrough.** Four steps: pick your course, check your setup, open your course workspace, and where to get help.
- **AURA: Explain an R error.** Paste a message R printed and get a plain-English explanation, the steps to fix it, and a link to the course page that covers it.
- **AURA: Run the course setup check script.** For MC 427, runs `mc427-setup-check.R` in an R terminal so the `SETUP OK` line appears for the Tools Stack Setup screenshot.

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

## License and citation

MIT. See [LICENSE](LICENSE). To cite the extension, use [CITATION.cff](CITATION.cff):

Leith, A. P. (2026). *AURA Lab R Companion* (Version 0.1.0) [Computer software]. AURA Lab, Southern Illinois University Edwardsville. https://github.com/AURA-Lab-SIUE/r-companion
