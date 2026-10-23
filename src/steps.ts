// Your steps (0.5.3, #rgui Rank 5): the pure parts. Every code-producing action writes its
// commented block into the student's open script, as 0.5.2 already did; only when no script is
// open does it go to the end of steps.R in the course folder (coordinator decision on the spec's
// Rank 5: one script, never two copies of the same block). Run my steps from the top runs
// whichever script holds them. No VS Code API here, so the unit tests load it directly.

import * as path from 'path';

/** The record file used only when no script is open. */
export const STEPS_FILE = 'steps.R';

/** Add a block to the end of a script: one blank line before it, LF endings, a trailing newline. */
export function appendBlock(before: string, block: string): string {
  const body = before.replace(/\r\n/g, '\n').replace(/\n*$/, '');
  const add = block.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
  return body ? `${body}\n\n${add}` : add;
}

/** Can Run my steps from the top run this file? R scripts directly, Quarto and R Markdown through knitr::purl(). */
export function runnableScript(file: string): 'r' | 'quarto' | undefined {
  if (/\.r$/i.test(file)) return 'r';
  if (/\.(qmd|rmd)$/i.test(file)) return 'quarto';
  return undefined;
}

/**
 * The line Run my steps from the top sends to R. The path is relative to the course folder when
 * the script is inside it (R's working directory there), with forward slashes. A Quarto file's R
 * chunks are pulled into a temporary R file first, so only its code runs, in order.
 */
export function runStepsCode(file: string, folder?: string): string {
  let p = path.resolve(file);
  if (folder) {
    const rel = path.relative(path.resolve(folder), p);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) p = rel;
  }
  const q = JSON.stringify(p.replace(/\\/g, '/'));
  return runnableScript(file) === 'quarto'
    ? `source(knitr::purl(${q}, output = tempfile(fileext = ".R"), quiet = TRUE), echo = TRUE)`
    : `source(${q}, echo = TRUE)`;
}

export const RUN_STEPS_NOTICE =
  'Your steps run from the top in the order they are in the script. If a later block reads a table an earlier block made, this is where that shows.';
