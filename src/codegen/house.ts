// House style for generated R code (workstream E, #rgui).
//
// Every generated block follows the course house style, verified line for line against the
// golden fixtures in O:\20-research\aura-lab\r-companion-golden\fixtures\ (manifest.json):
//   - the tidyverse with the magrittr pipe %>%, never the base pipe |>;
//   - one verb per line after each pipe;
//   - a comment block above each step (the "# ---- title ----" banner plus plain-English lines);
//   - an expected-output or "prints nothing" note where the course starters carry one;
//   - a trailing newline, LF line endings, no trailing whitespace.
//
// The comment header is kept on every block on purpose: owner decision U1 (q-20261018-0035 = A)
// says menu output is not AI use as long as that header stays and the student can explain each line.

/** The v2v package version the generated code targets. Governs the join_chat_streams() output. */
export type V2vVersion = '0.3.2' | '0.3.3';

/** Join lines into one R block: LF endings, exactly one trailing newline, no trailing spaces. */
export function lines(...rows: string[]): string {
  return rows.join('\n') + '\n';
}

/** The comment-header banner that opens every generated block. */
export function banner(title: string): string {
  return `# ---- ${title} ----`;
}
