// Every path that hands code to vscode-R makes an R terminal active first (#rgui, 2026-10-31).
// With r.alwaysUseActiveTerminal on, vscode-R sends to the active terminal of any kind; on testbench
// a line went into an active PowerShell terminal. The glue lives in extension.ts, which needs the
// VS Code host to run, so these tests read its source.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');

/** The body of a top-level function, from its signature to the next top-level closing brace. */
function body(name: string): string {
  const start = src.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end);
}

test('Run it activates an R terminal before r.runCommand sends a block through vscode-R', () => {
  const b = body('runInSession');
  const branch = b.slice(b.indexOf("adapter.id === 'vscode-r' && vscodeRTerminalOpen()"));
  const activate = branch.indexOf('activateRTerminal(');
  const run = branch.indexOf('adapter.runCode(code)');
  assert.ok(activate >= 0 && run > activate, 'the vscode-R branch must call activateRTerminal before adapter.runCode');
});

test("the run keys activate an R terminal before running vscode-R's command", () => {
  const b = body('runInR');
  const activate = b.indexOf('activateRTerminal(');
  const run = b.indexOf('executeCommand(cmd)');
  assert.ok(activate >= 0 && run > activate);
});

test('the run keys and the Run button ask for Workspace Trust before starting R, and resume the same command', () => {
  const b = body('runInR');
  const trust = b.search(/requireTrust\([^;]*,\s*\(\)\s*=>\s*runInR\(cmd\)\)/);
  const activate = b.indexOf('activateRTerminal(');
  assert.ok(trust >= 0, 'runInR must call requireTrust with a callback that reruns the same command');
  assert.ok(activate > trust, 'trust comes before any terminal is activated or started');
});

test('the run keys read the editor at the key press and run nothing if it changed while R started', () => {
  const b = body('runInR');
  const before = b.indexOf('snapshotEditor()');
  const trust = b.indexOf('requireTrust(');
  const activate = b.indexOf('activateRTerminal(');
  const check = b.indexOf('sameEditor(');
  const run = b.indexOf('executeCommand(cmd)');
  assert.ok(before >= 0 && before < trust && before < activate, 'snapshot first');
  assert.ok(check > activate && run > check, 'compare after activation, before running');
});

test('Run it and the run keys stop, with a message, when R is not the active terminal', () => {
  for (const name of ['runInR', 'runInSession']) {
    const b = body(name);
    assert.ok(/catch\s*\(\s*e\s*\)[\s\S]*RNotActiveError/.test(b), `${name} handles RNotActiveError`);
  }
});
