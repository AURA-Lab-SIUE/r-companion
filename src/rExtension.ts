// The R extension for VS Code (vscode-R, REditorSupport.r) as the Companion depends on it (0.5.4).
// The startup check for a missing or turned-off R extension.

import * as vscode from 'vscode';
import { VSCODE_R_ID } from './checklist';
import { inPositron } from './adapters';

export const R_EXT_MISSING =
  'The R extension for VS Code (by REditorSupport) is not installed or is turned off, so VS Code cannot connect to R. Select Show the R extension, then Install or Enable.';
export const SHOW_R_EXT = 'Show the R extension';

/** Opens the Extensions view on the R extension: Install when it is missing, Enable when it is off. */
export function showRExtension(): Thenable<unknown> {
  return vscode.commands.executeCommand('workbench.extensions.search', `@id:${VSCODE_R_ID}`);
}

/**
 * One quiet notice at startup when the R extension is missing or disabled (VS Code reports both the
 * same way: getExtension returns undefined). Positron brings its own R support, so it is skipped there.
 * Returns whether the notice was shown.
 */
export function checkRExtensionAtStartup(): boolean {
  if (inPositron() || vscode.extensions.getExtension(VSCODE_R_ID)) return false;
  void vscode.window.showWarningMessage(R_EXT_MISSING, SHOW_R_EXT).then((b) => b && showRExtension());
  return true;
}
