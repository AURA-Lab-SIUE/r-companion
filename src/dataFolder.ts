// Make the course workspace's data folder when it is missing (0.7.3, owner q-20261109-0117).
//
// The MC 451 and MC 501 guides, the v2v package (write_coding_form() writes data/coding-form.csv),
// and this extension's reliability grid (data/derived/) all keep files in a folder named data at the
// top of the course workspace. The v2v-workspace template students copied had no such folder before
// 2026-11-09, and a copy never receives later template changes, so the Companion makes the empty
// folder in an existing copy. It only ever creates one empty folder: it never moves, renames, or
// writes a file, and it does nothing when anything named data (any capitalization) is already there.
// Making an empty folder is safe in an untrusted folder, so no trust prompt.

import * as fs from 'fs';
import * as path from 'path';

/** What ensureDataFolder found or did. */
export type DataFolderResult =
  | 'created' // made <root>/data
  | 'present' // a folder named data (any capitalization) is already there
  | 'blocked' // a FILE named data (any capitalization) is there, so nothing was made
  | 'not-course'; // not a v2v-workspace course folder, so nothing was made

/**
 * True when root is a copy of the v2v-workspace template (MC 451 and MC 501): it holds the template's
 * setup check and its 03_Project folder, and is not the MC 427 course folder.
 */
export function isV2vWorkspace(root: string): boolean {
  try {
    return (
      fs.statSync(path.join(root, '00-check-your-setup.qmd')).isFile() &&
      fs.statSync(path.join(root, '03_Project')).isDirectory() &&
      !fs.existsSync(path.join(root, 'mc427-setup-check.R'))
    );
  } catch {
    return false;
  }
}

/** The top-level entry named data in any capitalization, if there is one. */
function existingDataEntry(root: string): string | undefined {
  try {
    return fs.readdirSync(root).find((n) => n.toLowerCase() === 'data');
  } catch {
    return undefined;
  }
}

/**
 * Makes <root>/data when root is a v2v-workspace copy without one. Idempotent: a second call returns
 * 'present'. Never touches an existing file or folder.
 */
export function ensureDataFolder(root: string): DataFolderResult {
  if (!isV2vWorkspace(root)) return 'not-course';
  const existing = existingDataEntry(root);
  if (existing !== undefined) {
    return fs.statSync(path.join(root, existing)).isDirectory() ? 'present' : 'blocked';
  }
  try {
    fs.mkdirSync(path.join(root, 'data')); // not recursive: fails rather than touch anything else
  } catch (e: any) {
    if (e?.code === 'EEXIST') return fs.statSync(path.join(root, 'data')).isDirectory() ? 'present' : 'blocked';
    throw e;
  }
  return 'created';
}

/** The one message shown after the folder was made. */
export function dataFolderMessage(): string {
  return (
    'R Companion made a folder named data in your course workspace. The course guides keep your CSV ' +
    'files there, and their read_csv() lines point to it, such as "data/coding-form.csv". Drag your ' +
    'coding sheets into it.'
  );
}
