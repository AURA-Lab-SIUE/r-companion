// The White Paper R steps (audit 2026-11-12, fix F5; owner q-20261112-0014: R-related items only).
// Each block is the line the worksheet teaches (09-coding-the-codebook Steps 3 and 4,
// 14-publishing-your-paper Steps 2, 7, and 13), so the panel and the worksheet show the same code.
// Pure, so the unit tests run it without VS Code.
import * as fs from 'fs';
import * as path from 'path';
import { lines, banner } from './codegen/house';

/** A project name the worksheet allows: lowercase letters, numbers, and single hyphens, no spaces. */
export function projectNameProblem(name: string): string | undefined {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name.trim())
    ? undefined
    : 'Use lowercase letters, numbers, and hyphens, with no spaces, such as podcast-ads-portfolio.';
}

/** Worksheet 09, Steps 3 and 4: allow a project inside the workspace, then create it once. */
export function newPortfolioBlock(name: string): string {
  return lines(
    banner('Create my White Paper project'),
    '# Your workspace is already a project, so first say yes to a project inside it.',
    '# This line prints nothing.',
    'options(usethis.allow_nested_project = TRUE)',
    '',
    '# Create the project folder once. If the folder is already there, it is left alone,',
    '# because building it again would replace your files with blank ones.',
    `project <- "${name.trim()}"`,
    'if (dir.exists(project)) {',
    '  message("Already made: using the folder you have.")',
    '} else {',
    '  v2v::new_portfolio(project)',
    '}',
  );
}

/** Worksheet 14, Step 2: name the project once; TRUE means R found it. */
export function pointAtProjectBlock(name: string): string {
  return lines(
    banner('Point R at my White Paper project'),
    '# Name your project folder once, so the later steps can use it. TRUE means R found it.',
    `project <- "${name}"`,
    'file.exists(file.path(project, "_quarto.yml"))',
  );
}

/** Worksheet 14, Step 13: render again and send the site to GitHub Pages. */
export function deployBlock(name: string): string {
  return lines(
    banner('Publish my White Paper site'),
    '# Commit and sync in Source Control first: publishing sends what you last committed.',
    '# Partway through, R asks "Publish to GitHub Pages? [y/N]". Click in the R console,',
    '# type y, and press Enter.',
    `project <- "${name}"`,
    'v2v::deploy_portfolio(project)',
  );
}

/** Worksheet 14, Step 7: a number written as inline R, computed again on every render. */
export const INLINE_R_SNIPPET = '`r format(${1:nrow(analysis)}, big.mark = ",")`';

/** The White Paper projects in the course folder: its subfolders that hold a _quarto.yml. */
export function findProjects(root: string | undefined): string[] {
  if (!root || !fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && fs.existsSync(path.join(root, d.name, '_quarto.yml')))
    .map((d) => d.name)
    .sort();
}
