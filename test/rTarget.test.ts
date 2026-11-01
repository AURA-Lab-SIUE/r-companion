// Which terminal an R run key uses (src/rTarget.ts). Never a shell; prefer the R that Run it uses.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { pickRTarget } from '../src/rTarget';

test('no terminal at all: open R (AURA)', () => {
  assert.deepEqual(pickRTarget([], -1), { kind: 'open' });
});

test('only a PowerShell terminal, and it is active: open R (AURA), never the shell', () => {
  assert.deepEqual(pickRTarget(['powershell'], 0), { kind: 'open' });
});

test('R (AURA) open but a shell is active: switch to R (AURA)', () => {
  assert.deepEqual(pickRTarget(['R (AURA)', 'pwsh', 'bash'], 2), { kind: 'existing', index: 0 });
});

test('the active terminal is already an R terminal: keep it', () => {
  assert.deepEqual(pickRTarget(['R (AURA)', 'R Interactive'], 0), { kind: 'existing', index: 0 });
  assert.deepEqual(pickRTarget(['R (AURA)', 'R Interactive'], 1), { kind: 'existing', index: 1 });
});

test("a shell is active and both kinds of R are open: vscode-R's, where Run it sends blocks", () => {
  assert.deepEqual(pickRTarget(['R (AURA)', 'R Interactive', 'cmd'], 2), { kind: 'existing', index: 1 });
  assert.deepEqual(pickRTarget(['R', 'R Interactive', 'pwsh'], 2), { kind: 'existing', index: 1 });
});

test('a terminal merely containing R in its name is not R', () => {
  assert.deepEqual(pickRTarget(['Run Task', 'Rscript build'], 0), { kind: 'open' });
});
