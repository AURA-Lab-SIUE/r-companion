// Unit tests for 0.5.4 (#rgui): the R extension is a dependency, the sess check, and the help report.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';

const ROOT = path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('the R extension is a declared dependency, so VS Code installs it with the Companion', () => {
  assert.deepEqual(pkg.extensionDependencies, ['REditorSupport.r']);
});
