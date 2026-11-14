// Render and preview the open .qmd (audit 2026-11-12, fix F2; owner q-20261112-0014: R-related items only).
// Pure so the unit tests can run it without VS Code.
import * as fs from 'fs';
import * as path from 'path';

/**
 * A worksheet in a subfolder that reads "data/..." will stop with "Execution halted" when Quarto renders it,
 * because Quarto starts R in the worksheet's own folder. Returns the warning, or undefined when it is fine.
 */
export function renderFolderProblem(qmdPath: string, root: string | undefined, text: string): string | undefined {
  if (!root) return undefined;
  const dir = path.resolve(path.dirname(qmdPath));
  if (dir === path.resolve(root)) return undefined;
  if (!/["']data\//.test(text)) return undefined;
  if (fs.existsSync(path.join(dir, 'data'))) return undefined;
  const rel = path.relative(root, dir).replace(/\\/g, '/');
  return (
    `This worksheet is in the folder ${rel}. It reads files from data/, and Quarto looks for data/ next to the worksheet, ` +
    'so the render will stop with "Execution halted". Move the worksheet to the top of your course folder, next to the data folder, and render it there.'
  );
}
