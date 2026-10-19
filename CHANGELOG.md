# Changelog

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
