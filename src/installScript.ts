// The R script behind Install what is missing. Pure: the unit tests build it and run it in R.

import { PackageSpec } from './profiles';

/** The R script that installs the plan. CRAN mirror set, binaries on Windows and macOS, a personal library when needed. */
export function installScript(plan: PackageSpec[], mirror: string): string {
  const q = (s: string) => JSON.stringify(s);
  const cran = plan.filter((p) => p.source === 'cran').map((p) => q(p.name));
  const gh = plan.filter((p) => p.source === 'github' && p.repo);
  const local = plan.filter((p) => p.source === 'local' && p.path);
  const lines = [
    '# Written by AURA Lab R Companion: Install what is missing',
    `options(repos = c(CRAN = ${q(mirror)}), install.packages.compile.from.sources = "never")`,
    '# Windows and macOS: CRAN\'s ready-built binaries only. R\'s default ("both") installs a package',
    '# from source whenever the source is newer than the binary, even with the option above, which',
    '# only stops packages that need compiling (seen on leith-hp 2026-10-19: datawizard, performance)',
    'if (.Platform$pkgType != "source") options(pkgType = "binary")',
    '# Install into the first library R can write to, creating the personal library if needed',
    'lib <- .libPaths()[1]',
    'if (file.access(lib, 2) != 0) {',
    '  lib <- Sys.getenv("R_LIBS_USER")',
    '  dir.create(lib, recursive = TRUE, showWarnings = FALSE)',
    '  .libPaths(c(lib, .libPaths()))',
    '}',
    'cat("Installing into", lib, "\\n")',
  ];
  if (cran.length) {
    lines.push(`install.packages(c(${cran.join(', ')}), lib = lib)`);
    lines.push(
      '# A package CRAN has no binary for yet: allow its source only when it needs no compiling',
      `still <- setdiff(c(${cran.join(', ')}), rownames(installed.packages(lib.loc = lib)))`,
      'if (length(still) && .Platform$pkgType != "source") install.packages(still, lib = lib, type = "both")',
    );
  }
  if (gh.length) {
    lines.push('if (!requireNamespace("remotes", quietly = TRUE)) install.packages("remotes", lib = lib)');
    for (const p of gh) {
      lines.push(`remotes::install_github(${q(p.repo as string)}, upgrade = "never", force = TRUE, lib = lib)`);
    }
  }
  // After CRAN, so a local package's imports are already there (sess needs processx, later, jsonlite,
  // rstudioapi). Pure R source packages, so no compiler is needed.
  for (const p of local) {
    lines.push(`install.packages(${q((p.path as string).replace(/\\/g, '/'))}, repos = NULL, type = "source", lib = lib)`);
  }
  lines.push('cat("AURA install step finished. The check below reads the library to see what actually installed.\\n")');
  return lines.join('\n') + '\n';
}
