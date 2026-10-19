# Changelog

## 0.1.0 (R1 Setup)

- **AURA: Check my setup** finds R (settings, PATH, Windows registry, standard folders), checks each package the course needs, Quarto and Git where the course uses them, and shows `v2v::setup()` as a checklist for MC 451 and MC 501.
- **AURA: Install what is missing** installs with the CRAN mirror set, into the personal library when needed, and the course package v2v from GitHub. It then re-checks from the R library, never from the exit code.
- Get Started walkthrough: pick your course, check setup, open your course workspace, where to get help.
- **AURA: Explain an R error**: the failure headings from the course install and fix-it pages, mapped to plain-English fixes.
- Three ways to run R: Positron, the R extension (REditorSupport), or a plain R terminal with bracketed paste off.
- Update check for `.vsix` installs only, off until a release address is set. No telemetry.
