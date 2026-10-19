// Insert generated R at the cursor, in a .R file or a .qmd chunk.
//
// The decks tell students to work in a .qmd chunk (s24, s26). So in a Quarto document the code
// goes inside the ```{r} chunk the cursor is in; if the cursor is not in a chunk, it is wrapped
// in a new one. In a plain .R file the code is inserted as it is. Pure, so it is unit-tested.

/** Is the cursor inside an R code chunk? Scans the lines above it for the nearest fence. */
export function isInsideRChunk(linesAbove: string[]): boolean {
  for (let i = linesAbove.length - 1; i >= 0; i--) {
    const line = linesAbove[i].trimStart();
    if (/^```\{r\b/.test(line)) return true; // nearest fence opens an R chunk
    if (/^```\s*$/.test(line)) return false; // nearest fence closes a chunk
  }
  return false;
}

/** Wrap a block of R in a Quarto R chunk, with any `#|` chunk options first. */
export function wrapChunk(code: string, options: string[] = []): string {
  const body = code.replace(/\n+$/, '');
  return '```{r}\n' + options.map((o) => o + '\n').join('') + body + '\n```\n';
}

// Quarto does not read ggplot2's labs(alt = ...): checked 2026-10-19 with Quarto 1.9.38 and knitr
// 1.52, the rendered <img> had no alt attribute. So a chart in a Quarto document also gets a
// fig-alt chunk option for the same sentence.
export const FIG_ALT_OPTION = '#| fig-alt: "YOUR TURN: the same one sentence as alt in labs() below."';

export interface InsertPlan {
  /** The text to insert at the cursor. */
  text: string;
  /** True when a new ```{r} chunk was added (so the caller can report it). */
  wrappedInChunk: boolean;
}

/**
 * Decide what to insert. `isQuarto` is true for .qmd/.Rmd; `insideChunk` says whether the cursor
 * is already in an R chunk there. The inserted block always ends with a newline.
 */
export function prepareInsert(code: string, isQuarto: boolean, insideChunk: boolean, chunkOptions: string[] = []): InsertPlan {
  const block = code.endsWith('\n') ? code : code + '\n';
  if (isQuarto && !insideChunk) {
    return { text: '\n' + wrapChunk(block, chunkOptions), wrappedInChunk: true };
  }
  return { text: block, wrappedInChunk: false };
}

/** A Quarto document by file extension. */
export function isQuartoFile(fileName: string): boolean {
  return /\.(qmd|rmd)$/i.test(fileName);
}

/**
 * The file path a generated chart block saves to, read from its first ggsave("...png") call, or
 * undefined if the block saves no PNG. The extension opens this file in an editor tab after the
 * chart runs, so the saved picture appears in front of the student even when the R graphics window
 * opens behind VS Code (Windows, seen on testbench 2026-10-19).
 */
export function savedChartPath(code: string): string | undefined {
  const m = code.match(/ggsave\(\s*["']([^"']+\.png)["']/i);
  return m ? m[1] : undefined;
}
