// Which terminal an R run key (Ctrl+Enter and the rest of vscode-R's run keys) should use.
//
// The Companion turns on vscode-R's r.alwaysUseActiveTerminal so Ctrl+Enter reaches R (AURA), the
// terminal Run it opens. vscode-R 3.2.2 then sends to the active terminal of ANY kind (on testbench
// 2026-10-31 a line went into an active PowerShell terminal), and with no terminal open it asked
// where to run. So before running vscode-R's command, the Companion makes an R terminal the active
// one: never a shell, and R (AURA) when there is none.

/** Terminal names that run R: vscode-R's own ("R Interactive"), the one its commands send to ("R"), and the Companion's. */
const VSCODE_R_NAMES = ['R Interactive', 'R'];
const AURA_NAME = 'R (AURA)';

export type RTarget = { kind: 'existing'; index: number } | { kind: 'open' };

export function isRTerminalName(name: string): boolean {
  return VSCODE_R_NAMES.includes(name) || name === AURA_NAME;
}

/**
 * @param names the names of the live terminals, in the window's order
 * @param active the index of the active terminal in `names`, or -1
 * @returns the R terminal to make active, or `open` to start R (AURA)
 */
export function pickRTarget(names: string[], active: number): RTarget {
  if (active >= 0 && active < names.length && isRTerminalName(names[active])) return { kind: 'existing', index: active };
  // The same preference as Run it: vscode-R's terminal first (Run it sends blocks there when one is
  // open), then the Companion's. The last one opened wins, as in vscode-R.
  for (const pick of [(n: string) => VSCODE_R_NAMES.includes(n), (n: string) => n === AURA_NAME]) {
    for (let i = names.length - 1; i >= 0; i--) if (pick(names[i])) return { kind: 'existing', index: i };
  }
  return { kind: 'open' };
}

/** vscode-R's commands that send code to a terminal and have a key in R or R Markdown files. */
export const R_RUN_COMMANDS = [
  'r.runSelection',
  'r.runSelectionRetainCursor',
  'r.runCurrentChunk',
  'r.runAboveChunks',
  'r.runSource',
  'r.runSourcewithEcho',
  'r.runFromBeginningToLine',
  'r.runFromLineToEnd',
];
