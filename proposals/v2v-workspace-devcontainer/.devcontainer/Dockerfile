# MC 451 and MC 501 Codespace rescue route: R 4.6.1 on Ubuntu 24.04, same pinned image as mc427-codespace.
FROM ghcr.io/rocker-org/devcontainer/r-ver:4.6@sha256:1660ee0beba698f16c84b9bdeba7014c09c9e9588ee307174f6b9f53a6276c4f

# Course packages from the 2026-10-08 snapshot of CRAN, so every codespace gets the same versions.
# The list is the hub's Install R page (Steps 3 and 4) plus remotes, pwr, and renv for MC 501.
# processx, later, jsonlite, and rstudioapi let the R extension's helper install without a download.
RUN install2.r --error --skipinstalled --ncpus -1 \
      --repos https://p3m.dev/cran/__linux__/noble/2026-10-08 \
      tidyverse janitor likert rmarkdown languageserver httpgd remotes quarto effectsize pwr renv \
      processx later jsonlite rstudioapi

# The course package from GitHub, pinned to the v0.3.2 commit, with upgrades off as the hub page says.
# install_github() can fail and still exit 0, so the last line fails the build unless v2v loads at 0.3.2.
RUN Rscript -e 'options(repos = c(CRAN = "https://p3m.dev/cran/__linux__/noble/2026-10-08")); remotes::install_github("AURA-Lab-SIUE/v2v-r@b0aa330", upgrade = "never")' \
 && Rscript -e 'library(tidyverse); library(v2v); stopifnot(packageVersion("v2v") == "0.3.2")'
