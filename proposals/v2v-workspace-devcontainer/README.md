# Proposed `.devcontainer` for AURA-Lab-SIUE/v2v-workspace (Codespace rescue route)

Status: proposal from workstream A of #rgui, not committed to v2v-workspace and not pushed.

- `Dockerfile`: same pinned Rocker image as `mc427-codespace`; course packages from the 2026-10-08 P3M CRAN snapshot; `v2v` from GitHub pinned to commit `b0aa330` (version 0.3.2). The build fails unless tidyverse and v2v load.
- `devcontainer.json`: Quarto CLI through the Rocker devcontainer feature; the R extension pinned at 3.0.1 as in MC 427; `r.bracketedPaste` false and `r.plot.useHttpgd` true, matching the workspace's `.vscode/settings.json`.
- `aura-lab-siue.r-companion` in the extension list only installs once the extension is published to the Marketplace. Until then a codespace starts without it and logs a warning; nothing else fails. Pin an exact version (`aura-lab-siue.r-companion@0.1.0`) at publish time.

To apply: copy the `.devcontainer` folder into the root of v2v-workspace, commit, and push (owner gate).
