// The chart watcher: after a chart block runs, the PNG it ggsave()d opens in a VS Code tab (0.5.0).
// Moved out of menus.ts in 0.5.3 with no change in behavior.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { savedChartPath, isCompletePng } from './insert';

// The chart tasks: each writes alt text, gets a fig-alt chunk option in Quarto, and ggsave()s to a
// known file the extension opens in an editor tab once R has saved it (watchSavedChart).
export const CHART_TASKS = new Set(['bar', 'histogram', 'histogram-grouped', 'line', 'boxplot']);

// After a chart block runs, the saved PNG opens in a VS Code editor tab. On Windows the R graphics
// window opens BEHIND VS Code (seen on testbench, 2026-10-19), so the student never sees the chart;
// opening the file the block already ggsave()d puts it in front of them without depending on the R
// graphics device, and leaves vscode-R's own plot viewer (httpgd) untouched. The block saves a
// relative path; R's working directory is normally the workspace folder, so that and the open
// script's folder are the two places watched. Only a file written AFTER the block is sent is opened,
// so a stale PNG from a previous run is never shown.
//
// 0.5.0 waited a fixed 12 s after sending, so a busy R (a long block still running, or a slow first
// chart) never opened the tab. The watch now starts BEFORE the block is sent and lasts until the
// file lands complete (a file system watcher, plus a slow re-check for folders whose events go
// missing, such as synced or network folders), with a generous timeout and an Output line if the
// picture never appears. A newer run of the same chart replaces the older watch.
const CHART_WAIT_MS = 5 * 60 * 1000;
const CHART_RECHECK_MS = 2000;
const chartWatches = new Map<string, () => void>();

export interface ChartWatch {
  /** Resolves once the chart has opened, the wait timed out, or the watch was cancelled. */
  done: Promise<void>;
  cancel: () => void;
}

export function watchSavedChart(output: vscode.OutputChannel, code: string, waitMs = CHART_WAIT_MS): ChartWatch | undefined {
  const rel = savedChartPath(code);
  if (!rel) return undefined;
  const bases: string[] = [];
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) bases.push(folder.uri.fsPath);
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.uri.scheme === 'file') {
    const dir = path.dirname(editor.document.uri.fsPath);
    if (!bases.some((b) => path.resolve(b) === path.resolve(dir))) bases.push(dir);
  }
  const candidates = path.isAbsolute(rel) ? [rel] : bases.map((b) => path.join(b, rel));
  if (candidates.length === 0) return undefined;

  const key = candidates.map((c) => path.resolve(c).toLowerCase()).join('|');
  chartWatches.get(key)?.();

  const stamp = (c: string) => {
    try {
      const st = fs.statSync(c);
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return '';
    }
  };
  const before = new Map(candidates.map((c) => [c, stamp(c)] as const));

  const disposables: vscode.Disposable[] = [];
  let finished = false;
  let recheck: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((r) => (resolveDone = r));
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(recheck);
    clearTimeout(timeout);
    for (const d of disposables) d.dispose();
    if (chartWatches.get(key) === cancel) chartWatches.delete(key);
    resolveDone();
  };
  const cancel = () => finish();

  const look = async () => {
    if (finished) return;
    for (const c of candidates) {
      const now = stamp(c);
      if (!now || now === before.get(c)) continue;
      let bytes: Buffer;
      try {
        bytes = fs.readFileSync(c);
      } catch {
        continue; // still being written, or locked: the next event or re-check looks again
      }
      if (!isCompletePng(bytes)) continue;
      finish();
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(c), {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
        preview: false,
      });
      output.appendLine(`Chart saved and opened: ${c}`);
      return;
    }
  };

  for (const b of bases) {
    if (path.isAbsolute(rel)) break;
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(b), rel.replace(/\\/g, '/')),
    );
    watcher.onDidCreate(() => void look(), undefined, disposables);
    watcher.onDidChange(() => void look(), undefined, disposables);
    disposables.push(watcher);
  }
  if (path.isAbsolute(rel)) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(rel)), path.basename(rel)),
    );
    watcher.onDidCreate(() => void look(), undefined, disposables);
    watcher.onDidChange(() => void look(), undefined, disposables);
    disposables.push(watcher);
  }
  recheck = setInterval(() => void look(), CHART_RECHECK_MS);
  timeout = setTimeout(() => {
    if (finished) return;
    finish();
    const minutes = Math.round(waitMs / 60000);
    output.appendLine(
      `Chart: waited ${minutes} minute${minutes === 1 ? '' : 's'} for ${rel}, and it was not saved. ` +
        'Look in the R terminal: if R printed an error, run AURA: Explain an R error; if R is still busy, ' +
        `the picture will be in the figures folder when it finishes. Looked in: ${candidates.join(' ; ')}`,
    );
  }, waitMs);
  chartWatches.set(key, cancel);
  return { done, cancel };
}
