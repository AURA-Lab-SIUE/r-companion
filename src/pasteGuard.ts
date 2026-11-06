// Keep vscode-R's r.bracketedPaste off (0.7.1, Mac readiness audit 2026-11-06).
//
// With r.bracketedPaste on, vscode-R 3.2.2 wraps every line Ctrl+Enter (Cmd+Enter on a Mac) sends in
// ESC[200~ ... ESC[201~. Only radian reads those markers. Plain R prints them: on Windows as [200~
// and [201~, and on a Mac, whose CRAN R reads keys with readline 5.2, as 00~ and 01~, with an error
// for the broken line. Toggled on m4 2026-11-06 (VS Code 1.126.0, vscode-R 3.2.2, R 4.6.2 arm64):
// Workspace value true sent the markers and R printed "00~x <- 1 + 1; print(x)01~"; false sent the
// plain line and R printed [1] 2. The User tab, which Settings opens on, showed it unticked both times.
//
// The v2v-workspace template itself set it true from 2026-07-31 to 2026-09-08, so a course folder
// copied from the template in that window still carries it in .vscode/settings.json. The Companion
// turns it off wherever it is on, unless the R console is radian, the one console that needs it.

/** The parts of vscode's ConfigurationInspect the guard reads. */
export interface PasteInspect {
  globalValue?: boolean;
  workspaceValue?: boolean;
  workspaceFolderValue?: boolean;
}

export type PasteScope = 'user' | 'workspace' | 'folder';

/** True when the configured R console is radian, which reads bracketed paste itself. */
export function isRadian(rterm: string | undefined): boolean {
  return /radian/i.test(rterm ?? '');
}

/**
 * The scopes where r.bracketedPaste must be turned off: each one that sets it true. Empty when the
 * console is radian.
 * @param inspect the setting as VS Code reports it (workspaceFolderValue from a folder's own inspect)
 * @param rterm the r.rterm.<os> setting
 */
export function pasteScopesToClear(inspect: PasteInspect | undefined, rterm: string | undefined): PasteScope[] {
  if (!inspect || isRadian(rterm)) return [];
  const out: PasteScope[] = [];
  if (inspect.workspaceFolderValue === true) out.push('folder');
  if (inspect.workspaceValue === true) out.push('workspace');
  if (inspect.globalValue === true) out.push('user');
  return out;
}

/** The one message shown after the guard turned the setting off. */
export function pasteGuardMessage(scopes: PasteScope[]): string {
  const where = scopes.map((s) => (s === 'user' ? 'your User settings' : s === 'workspace' ? "this folder's settings" : 'a folder setting')).join(' and ');
  return (
    `R Companion turned off R: Bracketed Paste in ${where}. It made R print stray characters ` +
    '(00~ and 01~ on a Mac, [200~ and [201~ on Windows) around each line you ran. Run the line again.'
  );
}
