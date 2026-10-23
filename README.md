# AURA Lab R Companion

A Visual Studio Code extension that gets students new to R to a working setup, then writes commented tidyverse code from menus. It is built for the R courses at Southern Illinois University Edwardsville: MC 427 Social Media Analytics, MC 451 Research Methods, and MC 501 Research Methods (graduate).

R stays visible. Every menu writes the code into your own script, with a comment on each step, so you can read it, run it, and explain it.

## What it does

- **Setup.** Finds R, checks every package your course needs, installs what is missing, and checks again from your R library.
- **Write R code.** Menus for importing data, wrangling, describing, charts, and the course's statistical tests. Each writes the same code the course pages teach.
- **Data viewer and coding sheet.** Opens a data file in a grid, and lets you code rows from your codebook. Your original file is never changed.
- **Reliability grid** (MC 451 and MC 501). Enter two coding passes and get Cohen's kappa and Krippendorff's alpha.
- **Explain an R error.** Paste what R printed and get a plain-English cause and the steps to fix it.

## Install

Search for **AURA Lab R Companion** in the Extensions view (Ctrl+Shift+X, or Cmd+Shift+X on a Mac) and select **Install**. It is on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=aura-lab-siue.r-companion) and [Open VSX](https://open-vsx.org/extension/aura-lab-siue/r-companion). You also need [R](https://cloud.r-project.org/); the extension takes care of the packages.

## Commands

Open the Command Palette (View, then Command Palette, or Ctrl+Shift+P) and type **AURA**.

| Command | What it does |
|---|---|
| Pick my course | Tells the extension which course's packages and code to use. |
| Check my setup | Reports R, each course package, and the R extension for VS Code, line by line. |
| Install what is missing | Installs the missing packages, then checks again. |
| Open my course workspace | Opens or clones your course folder. |
| Write R code | The menus: data, describe, and test. |
| Open the data viewer | The grid and coding sheet. |
| Reliability grid | Two coding passes and the reliability statistics. |
| Check my test choice | Says whether the test you chose fits your variables. |
| Explain an R error | A plain-English explanation of an R message. |
| Open an R terminal | Starts R in VS Code. |
| Where to get help | Course help pages and how to ask. |

## Privacy

No telemetry. The only network traffic is the CRAN and GitHub downloads you start with Install what is missing.

## More

The full guide, with every feature, the settings, accessibility, how the extension finds and runs R, and how to adapt it for another course, is in [docs/details.md](https://github.com/AURA-Lab-SIUE/r-companion/blob/main/docs/details.md). The changes in each release are in the [CHANGELOG](CHANGELOG.md).

It is part of [From Vibes to Variables](https://aura-lab.siue.edu/v2v/), the AURA Lab's open methods package, with the [course hub](https://aura-lab.siue.edu/v2v-hub/), the [v2v R package](https://github.com/AURA-Lab-SIUE/v2v-r), and the [course workspace](https://github.com/AURA-Lab-SIUE/v2v-workspace). MC 427 uses the [mc427-codespace](https://github.com/AURA-Lab-SIUE/mc427-codespace) template.

## Development

```
npm install
npm test                    # compiles, then runs the unit tests
npm run check:separation    # fails on any SIM DAD or TASS source
npm run package             # all of the above, then builds dist/r-companion-<version>.vsix
```

This is an AURA Lab project. It contains no SIM DAD LLC or TASS source, and `scripts/check-separation.mjs` fails the build if any appears.

## License and citation

MIT. See [LICENSE](LICENSE). To cite the extension, use [CITATION.cff](CITATION.cff).
