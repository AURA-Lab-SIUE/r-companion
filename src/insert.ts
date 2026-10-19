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

/** Wrap a block of R in a Quarto R chunk. */
export function wrapChunk(code: string): string {
  const body = code.replace(/\n+$/, '');
  return '```{r}\n' + body + '\n```\n';
}

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
export function prepareInsert(code: string, isQuarto: boolean, insideChunk: boolean): InsertPlan {
  const block = code.endsWith('\n') ? code : code + '\n';
  if (isQuarto && !insideChunk) {
    return { text: '\n' + wrapChunk(block), wrappedInChunk: true };
  }
  return { text: block, wrappedInChunk: false };
}

/** A Quarto document by file extension. */
export function isQuartoFile(fileName: string): boolean {
  return /\.(qmd|rmd)$/i.test(fileName);
}
