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

// ---- library() lines already in the script (0.7.1, owner 2026-11-06) ----
//
// Every Write R code block starts with the library() lines it needs, so a script built from several
// blocks collected library(tidyverse) once per block. A block now leaves out a library() line whose
// package the script already loads ABOVE the insertion point (a load below it would come too late
// when the script runs top to bottom), along with the "# Load the ..." comment that only introduced
// it. Run it still sends the whole block, so the package is always loaded in R.

const LIBRARY_LINE = /^\s*(?:library|require)\(\s*["'`]?([A-Za-z][A-Za-z0-9._]*)["'`]?\s*\)\s*;?\s*(?:#.*)?$/;

/** The packages a script loads with library() or require(), one call per line. */
export function loadedPackages(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = LIBRARY_LINE.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

export interface LibrarySkip {
  /** The block to insert, without the library() lines already above it. */
  code: string;
  /** The packages whose library() line was left out, in block order. */
  skipped: string[];
}

/**
 * Leaves out each library(pkg) line of `code` whose package `before` (the script above the cursor)
 * already loads, or that the block itself loaded earlier. A "# Load the ..." comment directly above
 * a removed line goes with it; a banner (# ---- title ----) or any other comment stays. Returns
 * `code` unchanged when nothing is left out.
 */
export function skipLoadedLibraries(code: string, before: string): LibrarySkip {
  const loaded = loadedPackages(before);
  const lines = code.split('\n');
  const drop = new Array<boolean>(lines.length).fill(false);
  const skipped: string[] = [];
  lines.forEach((line, i) => {
    const m = LIBRARY_LINE.exec(line);
    if (!m) return;
    if (loaded.has(m[1])) {
      drop[i] = true;
      skipped.push(m[1]);
    } else {
      loaded.add(m[1]);
    }
  });
  if (skipped.length === 0) return { code, skipped };
  // A run of library() lines that lost any line also loses the "# Load ..." comment directly above
  // it: "Load both packages" is no longer true of one line. Any other comment stays.
  for (let i = 0; i < lines.length; i++) {
    if (!LIBRARY_LINE.test(lines[i]) || (i > 0 && LIBRARY_LINE.test(lines[i - 1]))) continue;
    let end = i;
    while (end + 1 < lines.length && LIBRARY_LINE.test(lines[end + 1])) end++;
    if (!drop.slice(i, end + 1).some(Boolean)) continue;
    let top = i;
    while (top > 0 && /^\s*#/.test(lines[top - 1]) && !/^\s*# ----/.test(lines[top - 1])) top--;
    if (top < i && /^\s*#\s*Load\b/i.test(lines[top])) for (let k = top; k < i; k++) drop[k] = true;
  }
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (drop[i]) continue;
    const blank = lines[i].trim() === '';
    const prev = kept[kept.length - 1];
    // Where a line was left out, no blank line at the top, after a comment (a banner, or one that
    // explains the next call), or after another blank line
    if (blank && drop[i - 1] && (prev === undefined || prev.trim() === '' || /^\s*#/.test(prev))) continue;
    kept.push(lines[i]);
  }
  return { code: kept.join('\n'), skipped };
}

/** True when a block holds nothing but comments and blank lines (every library() line was left out). */
export function onlyComments(code: string): boolean {
  return code.split('\n').every((l) => l.trim() === '' || /^\s*#/.test(l));
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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/**
 * Is this PNG file completely written? R's png device creates the file when ggsave() opens it and
 * fills it when the device closes, so a watcher can see the file before the picture is in it. A
 * finished PNG starts with the PNG signature and ends with the IEND chunk.
 */
export function isCompletePng(bytes: Buffer): boolean {
  return (
    bytes.length >= PNG_SIGNATURE.length + PNG_IEND.length &&
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
    bytes.subarray(bytes.length - PNG_IEND.length).equals(PNG_IEND)
  );
}
