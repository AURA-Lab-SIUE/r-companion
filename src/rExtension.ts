// The R extension for VS Code (vscode-R, REditorSupport.r) as the Companion depends on it (0.5.4).
// The startup check for a missing or turned-off R extension.

import * as vscode from 'vscode';
import { VSCODE_R_ID } from './checklist';
import { inPositron } from './adapters';
import { SESS_PROMPT } from './sess';

export const R_EXT_MISSING =
  'The R extension for VS Code (by REditorSupport) is not installed or is turned off, so VS Code cannot connect to R. Select Show the R extension, then Install or Enable. After that, the first time R opens, VS Code asks to install a helper called sess. Click Install bundled sess. You must say yes, or R will not connect.';
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
export const NOT_ATTACHED_NOTICE = `R opened, but it has not connected to VS Code (the status bar says "R: (not attached)"). ${SESS_PROMPT}`;
export const SHOW_BELL = 'Show notifications';
export const FIX_NOT_ATTACHED = 'Install what is missing';

/** What the attach watch has seen, for the help report. */
const attach: { api?: boolean; events: { kind: string; at: Date }[] } = { events: [] };

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
      attach.api = typeof onConnection === 'function';
      if (!attach.api) return;
      context.subscriptions.push(
        onConnection((e: { kind: string }) => {
          if (e?.kind === 'connected') lastConnected = Date.now();
          attach.events.push({ kind: String(e?.kind), at: new Date() });
          if (attach.events.length > 20) attach.events.shift();
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

/** The help report's "Connection between R and VS Code" lines. */
export function attachLines(): string[] {
  const ext = vscode.extensions.getExtension(VSCODE_R_ID);
  const terms = vscode.window.terminals.map((t) => t.name).filter((n) => /(^|\s)R(\s|$)|R Interactive|R \(AURA\)/.test(n));
  const lines = [
    `R extension session API: ${!ext ? 'no R extension' : attach.api === undefined ? 'not read yet' : attach.api ? 'available (vscode-R 3.2.0 or newer)' : 'not offered by this version'}`,
    `R session watcher setting (r.sessionWatcher): ${vscode.workspace.getConfiguration('r').get<boolean>('sessionWatcher', true) ? 'on' : 'off'}`,
    `R terminals open now: ${terms.length ? terms.join(', ') : 'none'}`,
  ];
  if (attach.api) {
    lines.push(
      attach.events.length
        ? `Connection events since this window opened: ${attach.events.map((e) => `${e.kind} at ${e.at.toLocaleTimeString()}`).join('; ')}`
        : 'Connection events since this window opened: none, so no R terminal has connected to VS Code yet',
    );
  }
  lines.push(`If R does not connect: ${SESS_PROMPT}`);
  return lines;
}
