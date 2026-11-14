// New R script in my course folder, and Open a starter (audit 2026-11-12, fix F8). Pure, for the unit tests.
import * as fs from 'fs';
import * as path from 'path';

/** A script name the student can type: letters, numbers, hyphens, and underscores, with or without .R. */
export function scriptNameProblem(name: string): string | undefined {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name.trim().replace(/\.r$/i, ''))
    ? undefined
    : 'Use letters, numbers, hyphens, or underscores, with no spaces, such as choose-test.';
}

/** The file name, always ending in .R. */
export function scriptFileName(name: string): string {
  return name.trim().replace(/\.r$/i, '') + '.R';
}

/** What a new script starts with: a line to describe it, then the tidyverse. */
export function newScriptText(): string {
  return ['# YOUR TURN: one line saying what this script does.', '', 'library(tidyverse)', ''].join('\n');
}

/** The .R files in the course folder's starters folder, sorted. */
export function listStarters(root: string | undefined): string[] {
  const dir = root ? path.join(root, 'starters') : '';
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.r$/i.test(d.name))
    .map((d) => d.name)
    .sort();
}

/** A function name for Help for an R function: name or package::name, no brackets (audit F10). */
export const FUNCTION_NAME = /^([A-Za-z][A-Za-z0-9.]*::)?[A-Za-z.][A-Za-z0-9._]*$/;

/** The line that opens the help page: ?name, or ?pkg::name. */
export function helpLine(name: string): string {
  return '?' + name.trim();
}
