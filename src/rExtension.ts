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

// ---------- attach watch ----------

/** How long a new vscode-R terminal gets to attach before the Companion says something. */
export const ATTACH_WAIT_MS = 30000;
export const NOT_ATTACHED_NOTICE =
  'R opened, but VS Code has not connected to it, so the status bar says "R: (not attached)". If a question about sess is waiting under the bell at the bottom right, choose Install bundled sess. Otherwise select Fix not attached.';
export const SHOW_BELL = 'Show notifications';
export const FIX_NOT_ATTACHED = 'Fix not attached';

/** vscode-R names its R terminals "R Interactive" (3.2.0). */
export function isVscodeRTerminal(name: string): boolean {
  return /^R Interactive/.test(name);
}

/**
 * Watches each new vscode-R terminal: when vscode-R's session API (3.2.0 and newer) has not said
 * "connected" ATTACH_WAIT_MS after the terminal opened, one notice points to the bell and to Fix
 * not attached, at most once per window. Does nothing when vscode-R has no such API. Returns how
 * many notices it has shown, for tests and support.
 */
export function watchAttach(context: vscode.ExtensionContext, waitMs = ATTACH_WAIT_MS): () => number {
  let shown = 0;
  const ext = vscode.extensions.getExtension(VSCODE_R_ID);
  if (!ext || inPositron()) return () => shown;
  let lastConnected = 0;
  const pending = new Map<vscode.Terminal, NodeJS.Timeout>();
  void Promise.resolve(ext.isActive ? ext.exports : ext.activate()).then(
    (api: any) => {
      const onConnection = api?.session?.onDidChangeSessionConnection;
      if (typeof onConnection !== 'function') return;
      context.subscriptions.push(
        onConnection((e: { kind: string }) => {
          if (e?.kind === 'connected') lastConnected = Date.now();
        }),
        vscode.window.onDidOpenTerminal((t) => {
          if (!isVscodeRTerminal(t.name) || !vscode.workspace.getConfiguration('r').get<boolean>('sessionWatcher', true)) return;
          const opened = Date.now();
          pending.set(
            t,
            setTimeout(() => {
              pending.delete(t);
              if (lastConnected >= opened || t.exitStatus !== undefined || shown > 0) return;
              shown++;
              void vscode.window.showWarningMessage(NOT_ATTACHED_NOTICE, SHOW_BELL, FIX_NOT_ATTACHED).then((b) => {
                if (b === SHOW_BELL) void vscode.commands.executeCommand('notifications.showList');
                if (b === FIX_NOT_ATTACHED) void vscode.commands.executeCommand('auraR.fixNotAttached');
              });
            }, waitMs),
          );
        }),
        vscode.window.onDidCloseTerminal((t) => {
          clearTimeout(pending.get(t));
          pending.delete(t);
        }),
        { dispose: () => pending.forEach((h) => clearTimeout(h)) },
      );
    },
    () => undefined,
  );
  return () => shown;
}
