// Three ways to run R code the student can see, behind one interface.
//
//   1. Positron: the runtime API (positron.runtime.executeCode), when running inside Positron.
//   2. vscode-R: the R extension's own commands (r.runCommand for text, r.runSelection for the
//      editor selection), when REditorSupport.r is installed.
//   3. Terminal: a plain R terminal this extension opens, with bracketed paste off.
// Metadata (versions, package presence) never goes through these: it uses a short-lived Rscript.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface RunAdapter {
  readonly id: 'positron' | 'vscode-r' | 'terminal';
  readonly label: string;
  /** Runs R code in the student's visible R session. */
  runCode(code: string): Promise<void>;
  /** Runs the current editor selection (or line). */
  runSelection(): Promise<void>;
}

/** Positron hands extensions its API through a global function. Undefined outside Positron. */
function positronApi(): any | undefined {
  const acquire = (globalThis as any).acquirePositronApi;
  if (typeof acquire !== 'function') return undefined;
  try {
    return acquire();
  } catch {
    return undefined;
  }
}

export function inPositron(): boolean {
  return positronApi() !== undefined || /positron/i.test(vscode.env.appName);
}

class PositronAdapter implements RunAdapter {
  readonly id = 'positron' as const;
  readonly label = 'Positron console';
  constructor(private api: any) {}
  async runCode(code: string): Promise<void> {
    await this.api.runtime.executeCode('r', code, true);
  }
  async runSelection(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.positronConsole.executeCode');
  }
}

class VscodeRAdapter implements RunAdapter {
  readonly id = 'vscode-r' as const;
  readonly label = 'R extension terminal';
  async runCode(code: string): Promise<void> {
    // r.runCommand takes the text as its argument (vscode-R keybinding docs)
    await vscode.commands.executeCommand('r.runCommand', code);
  }
  async runSelection(): Promise<void> {
    await vscode.commands.executeCommand('r.runSelection');
  }
}

export class TerminalAdapter implements RunAdapter {
  readonly id = 'terminal' as const;
  readonly label = 'R terminal';
  private terminal: vscode.Terminal | undefined;
  constructor(private rterm: () => string | undefined, private storageDir: string) {}

  /** The terminal, created on first use. */
  open(): vscode.Terminal {
    if (this.terminal && this.terminal.exitStatus === undefined) return this.terminal;
    const rterm = this.rterm();
    const env: Record<string, string> = {};
    if (process.platform !== 'win32') {
      // GNU readline 8.1 turns bracketed paste on by default; plain R then prints the markers.
      // An inputrc that keeps the student's own settings and switches only that one off.
      fs.mkdirSync(this.storageDir, { recursive: true });
      const inputrc = path.join(this.storageDir, 'inputrc');
      const home = process.env.HOME ?? '';
      const userRc = process.env.INPUTRC || path.join(home, '.inputrc');
      const lines = ['$include /etc/inputrc'];
      if (fs.existsSync(userRc) && userRc !== inputrc) lines.push(`$include ${userRc}`);
      lines.push('set enable-bracketed-paste off', '');
      fs.writeFileSync(inputrc, lines.join('\n'));
      env.INPUTRC = inputrc;
    }
    this.terminal = vscode.window.createTerminal({
      name: 'R (AURA)',
      shellPath: rterm,
      shellArgs: ['--no-save', '--no-restore'],
      env,
    });
    return this.terminal;
  }

  async runCode(code: string): Promise<void> {
    const fresh = !this.terminal || this.terminal.exitStatus !== undefined;
    const t = this.open();
    t.show(true);
    if (fresh) {
      // Text sent before R has started is lost (seen on Windows 2026-10-18: the line never
      // reached R). Wait for the process, then give R time to print its banner and prompt.
      await t.processId;
      await new Promise((r) => setTimeout(r, 4000));
    }
    // One line at a time and never wrapped in paste markers
    for (const line of code.split(/\r?\n/)) {
      t.sendText(line, true);
    }
  }

  async runSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const sel = editor.selection;
    const text = sel.isEmpty ? editor.document.lineAt(sel.active.line).text : editor.document.getText(sel);
    await this.runCode(text);
  }

  dispose(): void {
    this.terminal?.dispose();
  }
}

/** Picks the adapter from the auraR.runWith setting and what is installed. */
export function pickAdapter(setting: string, terminal: TerminalAdapter): RunAdapter {
  const api = positronApi();
  const hasVscodeR = vscode.extensions.getExtension('REditorSupport.r') !== undefined;
  if (setting === 'positron' && api) return new PositronAdapter(api);
  if (setting === 'vscode-r' && hasVscodeR) return new VscodeRAdapter();
  if (setting === 'terminal') return terminal;
  if (api) return new PositronAdapter(api);
  if (hasVscodeR) return new VscodeRAdapter();
  return terminal;
}
