// Render and preview the open .qmd (audit 2026-11-12, fix F2; owner q-20261112-0014: R-related items only).
// Pure so the unit tests can run it without VS Code.
import * as fs from 'fs';
import * as path from 'path';

/**
 * A worksheet in a subfolder that reads "data/..." will stop with "Execution halted" when Quarto renders it,
 * because Quarto starts R in the worksheet's own folder. Returns the warning, or undefined when it is fine.
 */
/**
 * The nearest folder above the .qmd, below the course folder, that holds _quarto.yml (the White Paper project
 * from v2v::new_portfolio(), say), or undefined when the file is not inside one.
 */
export function quartoProjectOf(qmdPath: string, root: string | undefined): string | undefined {
  if (!root) return undefined;
  const top = path.resolve(root);
  let d = path.resolve(path.dirname(qmdPath));
  while (d !== top && d.startsWith(top + path.sep)) {
    if (fs.existsSync(path.join(d, '_quarto.yml'))) return d;
    d = path.dirname(d);
  }
  return undefined;
}

export function renderFolderProblem(qmdPath: string, root: string | undefined, text: string): string | undefined {
  if (!root) return undefined;
  const dir = path.resolve(path.dirname(qmdPath));
  if (dir === path.resolve(root)) return undefined;
  if (!/["']data\//.test(text)) return undefined;
  if (fs.existsSync(path.join(dir, 'data'))) return undefined;
  const rel = path.relative(root, dir).replace(/\\/g, '/');
  // A chapter of a Quarto project, such as the White Paper book's codebook/codebook.qmd, belongs where it is:
  // moving it to the course folder would pull it out of the book (rgui 2026-11-14, gap P1)
  const project = quartoProjectOf(qmdPath, root);
  if (project) {
    const up = path.relative(dir, project).replace(/\\/g, '/');
    if (!up) return undefined;
    const n = up.split('/').length;
    return (
      `This chapter is in the folder ${rel}, inside your project. It reads files from data/, and Quarto looks for data/ in the chapter's own folder, ` +
      `so the render will stop with "Execution halted". In this file, type ${up}/ in front of every data/ ` +
      `(${up}/ means: go up ${n === 1 ? 'one folder' : n + ' folders'} first), then render it again.`
    );
  }
  return (
    `This worksheet is in the folder ${rel}. It reads files from data/, and Quarto looks for data/ next to the worksheet, ` +
    'so the render will stop with "Execution halted". Move the worksheet to the top of your course folder, next to the data folder, and render it there.'
  );
}
