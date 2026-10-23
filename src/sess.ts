// The sess check in Check my setup (0.5.4). No VS Code API: the host passes in what it read.
//
// vscode-R 3.0 and newer connects an R terminal to VS Code through its own R package, sess, which
// it bundles. Before attaching, R looks for sess with the exact bundled source revision first in
// R's normal libraries (.libPaths()), then in a library vscode-R manages per R version:
//   <vscode-R global storage>/sess/<R platform>/<R major.minor>/<revision>/library, ready once
//   the .ready file beside it holds that revision.
// Without either, vscode-R asks under the bell; while that question waits R shows its banner and
// no > prompt (up to 180 s), and "Don't ask again" declines every later request with no question
// at all (vscode-R 3.2.0 R/attach_sess.R and its consent service; toggled on Pythia 2026-10-23).
// So the fix installs the bundled copy into the student's own library, which R checks first.

import * as fs from 'fs';
import * as path from 'path';
import { CheckItem, ProbePackage, versionBelow, VSCODE_R_MIN } from './checklist';
import { PackageSpec } from './profiles';

/**
 * What every 0.5.4 surface tells a student about the sess question (owner wording, 2026-10-23).
 * "Install bundled sess" is the button's own label in vscode-R 3.2.0.
 */
export const SESS_PROMPT =
  'The first time R opens, VS Code asks to install a helper called sess. Click Install bundled sess. You must say yes, or R will not connect. Missed it? Click the bell in the bottom-right corner to find it. If it is not there, run AURA: Install what is missing.';

/** sess's Imports that are not base R (vscode-R 3.2.0 sess DESCRIPTION). processx brings ps. */
export const SESS_IMPORTS = ['processx', 'later', 'jsonlite', 'rstudioapi'];
// The item name is the package name: Install what is missing verifies an install by item name
export const SESS_ITEM = 'sess';
const WHY_IMPORT = 'sess needs it to connect R to VS Code';

/** Where sess sits inside the vscode-R extension folder. */
export function bundledSessPath(vscodeRFolder: string): string {
  return path.join(vscodeRFolder, 'dist', 'resources', 'sess');
}

/** The "Config/vscode-R/source-revision" field of a sess DESCRIPTION, or null. */
export function parseRevision(description: string): string | null {
  const m = /^Config\/vscode-R\/source-revision:\s*(git-tree:[a-f0-9]{40}(?:[a-f0-9]{24})?)\s*$/m.exec(description);
  return m ? m[1] : null;
}

/** R "4.6.1" becomes "4.6", as vscode-R names its managed folders. */
export function majorMinor(rVersion: string): string {
  const [major, minor] = rVersion.split('.');
  return `${major}.${minor ?? '0'}`;
}

/** The managed folder for one R version and one sess revision (holds .ready and library/). */
export function managedSessDir(root: string, platform: string, rVersion: string, revision: string): string {
  return path.join(root, 'sess', platform, majorMinor(rVersion), revision.replace(/^git-tree:/, ''));
}

/** True when vscode-R finished installing this sess revision for this R version. */
export function managedReady(root: string, platform: string, rVersion: string, revision: string): boolean {
  const dir = managedSessDir(root, platform, rVersion, revision);
  try {
    const ready = fs.readFileSync(path.join(dir, '.ready'), 'utf8').trim();
    return ready === revision && fs.existsSync(path.join(dir, 'library', 'sess', 'DESCRIPTION'));
  } catch {
    return false;
  }
}

export interface SessFacts {
  /** The installed vscode-R version; undefined when it is not installed. */
  vscodeRVersion?: string;
  /** vscode-R's r.sessionWatcher setting (on by default). */
  sessionWatcher: boolean;
  /** The sess bundled with vscode-R: its folder and source revision. */
  bundled?: { path: string; revision: string };
  rVersion: string;
  /** sess copies in R's normal libraries, from the probe. */
  libraryCopies: { lib: string; revision: string | null }[];
  /** vscode-R's managed copy for this R version and revision is ready. */
  managedReady: boolean;
  /** The probe's package lines (it looked up SESS_IMPORTS too). */
  packages: ProbePackage[];
  /** Packages the course list already shows, so they are not listed twice. */
  alreadyListed: string[];
}

/** The checklist lines for sess: none before vscode-R 3.0, which attached without it. */
export function sessItems(f: SessFacts): CheckItem[] {
  if (!f.vscodeRVersion || versionBelow(f.vscodeRVersion, VSCODE_R_MIN)) return [];
  const rv = majorMinor(f.rVersion);
  if (!f.sessionWatcher) {
    return [
      {
        name: SESS_ITEM,
        group: 'VS Code',
        status: 'info',
        detail:
          'not checked, because the R extension setting R: Session Watcher is turned off. Turn it on in Settings so the Workspace panel and plots can connect to R.',
      },
    ];
  }
  if (!f.bundled) {
    return [
      {
        name: SESS_ITEM,
        group: 'VS Code',
        status: 'info',
        detail: 'not checked: the R extension\'s own copy of sess was not found. If the status bar says "R: (not attached)", run AURA: Fix not attached.',
      },
    ];
  }
  const revision = f.bundled.revision;
  const short = revision.replace(/^git-tree:/, '').slice(0, 7);
  const inLibrary = f.libraryCopies.find((c) => c.revision === revision);
  if (inLibrary) {
    return [{ name: SESS_ITEM, group: 'VS Code', status: 'ok', detail: `installed in your R library (revision ${short}), so R terminals can connect to VS Code` }];
  }
  if (f.managedReady) {
    return [{ name: SESS_ITEM, group: 'VS Code', status: 'ok', detail: `installed by the R extension for R ${rv}, so R terminals can connect to VS Code` }];
  }
  const items: CheckItem[] = [];
  const byName = new Map(f.packages.map((p) => [p.name, p]));
  for (const name of SESS_IMPORTS) {
    if (f.alreadyListed.includes(name)) continue;
    const p = byName.get(name);
    if (p && p.installed && p.loads) continue;
    items.push({
      name,
      group: 'VS Code',
      status: p && p.installed ? 'broken' : 'missing',
      detail: p && p.installed ? `installed but does not load (${WHY_IMPORT})` : `not installed (${WHY_IMPORT})`,
      installable: { name, why: WHY_IMPORT, level: 'required', source: 'cran' },
    });
  }
  const older = f.libraryCopies.length > 0;
  const spec: PackageSpec = { name: 'sess', why: 'connects R to VS Code', level: 'required', source: 'local', path: f.bundled.path };
  items.push({
    name: SESS_ITEM,
    group: 'VS Code',
    status: older ? 'outdated' : 'missing',
    detail:
      (older
        ? `your R library has a different copy of sess than this R extension needs, so R will not connect to VS Code. `
        : `not installed for R ${rv}, so R will not connect to VS Code (the status bar says "R: (not attached)"). `) + SESS_PROMPT,
    installable: spec,
  });
  return items;
}
