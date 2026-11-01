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

// ---- Activating R before a run (Copilot review of #5) ----

/** The editor a run key acted on: its document, the document's version, and each selection as [anchor line, anchor character, active line, active character]. */
export type EditorSnapshot = { uri: string; version: number; selections: number[][] };

/** True when `b` is the same document, at the same version, with the same selections, as `a`. */
export function sameEditor(a: EditorSnapshot | undefined, b: EditorSnapshot | undefined): boolean {
  if (!a || !b) return a === b;
  return a.uri === b.uri && a.version === b.version && JSON.stringify(a.selections) === JSON.stringify(b.selections);
}

/** One start at a time: a call while a start is in flight gets that same promise. */
export class InFlight<V> {
  private p: Promise<V> | undefined;
  get running(): boolean {
    return this.p !== undefined;
  }
  get current(): Promise<V> | undefined {
    return this.p;
  }
  run(f: () => Promise<V>): Promise<V> {
    if (this.p) return this.p;
    const p = f().finally(() => {
      if (this.p === p) this.p = undefined;
    });
    this.p = p;
    return p;
  }
}

/** R was not the live, active terminal when the code was about to be sent, so nothing was run. */
export class RNotActiveError extends Error {
  constructor() {
    super('R was not the active terminal, so nothing was run.');
    this.name = 'RNotActiveError';
  }
}

export interface ActivateDeps<T> {
  /** The live terminals, in the window's order. */
  live(): T[];
  active(): T | undefined;
  name(t: T): string;
  /** True for the Companion's own terminal while R is still starting in it. */
  isStarting(t: T): boolean;
  /** Opens R (AURA), or joins the start already in flight, and resolves once R is ready; undefined when R is not found. */
  start(): Promise<T | undefined>;
  show(t: T): void;
  /** Resolves true once `t` is the active terminal, false after `ms`. */
  waitActive(t: T, ms: number): Promise<boolean>;
  isLive(t: T): boolean;
}

/**
 * Makes an R terminal the active one, never a shell, starting R (AURA) when none is open. Throws
 * RNotActiveError unless that terminal is live and active once it is ready, so the caller sends
 * nothing; undefined when R is not found.
 */
export async function activateR<T>(d: ActivateDeps<T>): Promise<T | undefined> {
  const live = d.live();
  const a = d.active();
  const target = pickRTarget(live.map((t) => d.name(t)), a === undefined ? -1 : live.indexOf(a));
  let t: T | undefined;
  if (target.kind === 'existing') {
    t = live[target.index];
    // Opened by an earlier key press and R is still starting in it: wait for that same start
    if (d.isStarting(t)) t = await d.start();
  } else {
    t = await d.start();
  }
  if (t === undefined) return undefined;
  d.show(t);
  const ok = await d.waitActive(t, 2000);
  if (!ok || d.active() !== t || !d.isLive(t)) throw new RNotActiveError();
  return t;
}
