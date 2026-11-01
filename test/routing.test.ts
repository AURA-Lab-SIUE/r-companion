// Every path that hands code to R checks that R is there and active first (#rgui, 2026-10-31).
// With r.alwaysUseActiveTerminal on, vscode-R sends to the active terminal of any kind; on testbench
// a line went into an active PowerShell terminal. The glue lives in extension.ts and adapters.ts,
// which need the VS Code host to run, so these tests read their source. The decisions themselves
// (activateR, runKey, waitForR) are unit-tested in rTarget.test.ts.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');
const adapters = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'adapters.ts'), 'utf8');

/** The body of a function, from its signature to the next closing brace at its own indent. */
function body(name: string, text = src, indent = ''): string {
  const start = text.search(new RegExp(`(async )?function ${name}\\(|^\\s*(async )?${name}\\(`, 'm'));
  assert.ok(start >= 0, `${name} not found`);
  const end = text.indexOf(`\n${indent}}`, start);
  return text.slice(start, end);
}

test('Run it activates an R terminal before r.runCommand sends a block through vscode-R', () => {
  const b = body('runInSession');
  const branch = b.slice(b.indexOf("adapter.id === 'vscode-r' && vscodeRTerminalOpen()"));
  const activate = branch.indexOf('activateRTerminal(');
  const run = branch.indexOf('adapter.runCode(code)');
  assert.ok(activate >= 0 && run > activate, 'the vscode-R branch must call activateRTerminal before adapter.runCode');
});

test('the run keys go through runKey: trust, activation, and the editor check before the command', () => {
  const b = body('runInR');
  assert.ok(b.includes('runKey('), 'runInR delegates to runKey');
  assert.ok(/requireTrust:\s*\(rerun\)\s*=>\s*requireTrust\([^)]*,\s*rerun\)/.test(b), 'the trust resume is the one runKey passes, which keeps the key-press snapshot');
  assert.ok(b.includes('activate: () => activateRTerminal(cmd)'));
  assert.ok(b.includes('execute: () => vscode.commands.executeCommand(cmd)'));
});

test('Run it stops, with a message, when R is not active or closed, and never counts the block as run', () => {
  const b = body('runInSession');
  assert.ok(/catch\s*\(\s*e\s*\)[\s\S]*RNotActiveError[\s\S]*throw e/.test(b), 'runInSession warns on RNotActiveError and rethrows');
});

test('Run it with R not found throws, so the block is not counted as run', () => {
  const b = body('runInSession');
  assert.ok(b.includes('throw new RNotFoundError()'));
  assert.ok(!/R was not found[^\n]*\n\s*return;/.test(b), 'no plain return after R was not found');
});

test('the setup check stops with a message when R closed while starting', () => {
  const b = body('runCourseSetupCheck');
  assert.ok(/catch\s*\(\s*e\s*\)[\s\S]*RNotActiveError/.test(b));
});

test('the Companion terminal sends nothing to a closed R: ready() waits with waitForR, runCode checks the terminal is live', () => {
  const ready = body('ready', adapters, '  ');
  assert.ok(ready.includes('waitForR('), 'ready() waits through waitForR, which rejects when the terminal closes');
  const run = body('runCode', adapters.slice(adapters.indexOf('class TerminalAdapter')), '  ');
  const check = run.search(/if \(t\.exitStatus !== undefined\) throw new RClosedError\(\)/);
  const send = run.indexOf('sendText(');
  assert.ok(check >= 0 && send > check, 'runCode checks the terminal is live before sending');
});
