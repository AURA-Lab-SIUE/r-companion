// 0.6.0 owner decisions in the extension manifest (#rgui, 2026-10-31).

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));

test('Ctrl+Enter runs in the R terminal the Companion opened (q-20261031-0016)', () => {
  // Without it, the first Ctrl+Enter after Run it opened vscode-R's "Choose where to run" picker,
  // whose default started a new, empty R session (testbench, 2026-10-31, toggled)
  assert.equal(manifest.contributes.configurationDefaults?.['r.alwaysUseActiveTerminal'], true);
});

test("vscode-R's own languageserver prompt is off; Install what is missing is the one path (q-20261031-0017)", () => {
  assert.equal(manifest.contributes.configurationDefaults?.['r.lsp.promptToInstall'], false);
});

test('one product name on the Activity Bar icon and the panel (q-20261031-0019)', () => {
  const [container] = manifest.contributes.viewsContainers.activitybar;
  const [view] = manifest.contributes.views[container.id];
  assert.equal(manifest.displayName, 'AURA Lab R Companion');
  assert.equal(container.title, 'AURA Lab R Companion');
  assert.equal(view.name, 'AURA Lab R Companion');
});
