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
