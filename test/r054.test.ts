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

import * as os from 'os';
import { bundledSessPath, majorMinor, managedReady, managedSessDir, parseRevision, SESS_IMPORTS, SESS_ITEM, sessItems, SessFacts } from '../src/sess';
import { installPlan } from '../src/checklist';
import { installScript } from '../src/installScript';

const REV = 'git-tree:25da80133148500e2fc25eff593f49674324022e';
const PLATFORM = 'x86_64-w64-mingw32';

/** A vscode-R global storage folder laid out the way vscode-R 3.2.0 leaves it on Pythia. */
function managedRoot(versions: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-sess-'));
  for (const v of versions) {
    const dir = managedSessDir(root, PLATFORM, v, REV);
    fs.mkdirSync(path.join(dir, 'library', 'sess'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'library', 'sess', 'DESCRIPTION'), `Package: sess\nConfig/vscode-R/source-revision: ${REV}\n`);
    fs.writeFileSync(path.join(dir, '.ready'), `${REV}\n`);
  }
  return root;
}

const pkgs = (missing: string[] = []) =>
  SESS_IMPORTS.map((name) => ({ name, installed: !missing.includes(name), version: missing.includes(name) ? null : '1.0', loads: !missing.includes(name), error: null }));

function facts(over: Partial<SessFacts>): SessFacts {
  return {
    vscodeRVersion: '3.2.0',
    sessionWatcher: true,
    bundled: { path: 'C:/Users/s/.vscode/extensions/reditorsupport.r-3.2.0/dist/resources/sess', revision: REV },
    rVersion: '4.6.1',
    libraryCopies: [],
    managedReady: false,
    packages: pkgs(),
    alreadyListed: [],
    ...over,
  };
}

test('sess paths: the managed folder is per R major.minor and per revision, as vscode-R 3.2.0 lays it out', () => {
  assert.equal(majorMinor('4.6.1'), '4.6');
  assert.equal(majorMinor('4.10.0'), '4.10');
  assert.equal(
    managedSessDir('/g/reditorsupport.r', PLATFORM, '4.6.1', REV).replace(/\\/g, '/'),
    `/g/reditorsupport.r/sess/${PLATFORM}/4.6/25da80133148500e2fc25eff593f49674324022e`,
  );
  assert.equal(bundledSessPath('/ext/reditorsupport.r-3.2.0').replace(/\\/g, '/'), '/ext/reditorsupport.r-3.2.0/dist/resources/sess');
  assert.equal(parseRevision(`Package: sess\nVersion: 3.2.0\nConfig/vscode-R/source-revision: ${REV}\nNeedsCompilation: no\n`), REV);
  assert.equal(parseRevision('Package: sess\nVersion: 3.0.1\n'), null);
});

test('sess paths: an R 4.5-only managed library is not ready for R 4.6.1 (Pythia, 2026-10-23)', () => {
  const root = managedRoot(['4.5.2']);
  assert.equal(managedReady(root, PLATFORM, '4.5.2', REV), true);
  assert.equal(managedReady(root, PLATFORM, '4.6.1', REV), false);
});

test('sess paths: with a 4.6 folder present, R 4.6.1 is ready; a .ready for another revision is not', () => {
  const root = managedRoot(['4.5.2', '4.6.0']);
  assert.equal(managedReady(root, PLATFORM, '4.6.1', REV), true);
  const other = 'git-tree:' + '1'.repeat(40);
  assert.equal(managedReady(root, PLATFORM, '4.6.1', other), false);
  fs.writeFileSync(path.join(managedSessDir(root, PLATFORM, '4.6.1', REV), '.ready'), other);
  assert.equal(managedReady(root, PLATFORM, '4.6.1', REV), false, 'a .ready naming a different revision means vscode-R will ask again');
});

test('sess check: missing for R 4.6 lists sess and its missing imports, all installable, sess last', () => {
  const items = sessItems(facts({ packages: pkgs(['processx', 'later']) }));
  assert.deepEqual(items.map((i) => [i.name, i.status]), [['processx', 'missing'], ['later', 'missing'], [SESS_ITEM, 'missing']]);
  const sess = items[items.length - 1];
  assert.match(sess.detail, /R 4\.6/);
  assert.match(sess.detail, /not attached/);
  assert.match(sess.detail, /Install what is missing/);
  assert.doesNotMatch(sess.detail, /\u2014/, 'no em dashes');
  const plan = installPlan(items, false);
  assert.deepEqual(plan.map((p) => [p.name, p.source]), [['processx', 'cran'], ['later', 'cran'], ['sess', 'local']]);
});

test('sess check: ready in the managed library or in the R library is OK, and imports are not re-listed', () => {
  assert.deepEqual(sessItems(facts({ managedReady: true, packages: pkgs(['processx']) })).map((i) => [i.name, i.status]), [[SESS_ITEM, 'ok']]);
  const lib = sessItems(facts({ libraryCopies: [{ lib: 'C:/R/lib', revision: REV }] }));
  assert.deepEqual(lib.map((i) => i.status), ['ok']);
  assert.match(lib[0].detail, /your R library/);
});

test('sess check: a copy with another revision is NEEDS UPDATE; a course package is not listed twice', () => {
  const items = sessItems(facts({ libraryCopies: [{ lib: 'C:/R/lib', revision: 'git-tree:' + 'a'.repeat(40) }], packages: pkgs(['jsonlite']), alreadyListed: ['jsonlite'] }));
  assert.deepEqual(items.map((i) => [i.name, i.status]), [[SESS_ITEM, 'outdated']]);
});

test('sess check: nothing before vscode-R 3.0, a note when the session watcher is off or the bundled copy is missing', () => {
  assert.deepEqual(sessItems(facts({ vscodeRVersion: '2.8.8' })), []);
  assert.deepEqual(sessItems(facts({ vscodeRVersion: undefined })), []);
  assert.equal(sessItems(facts({ sessionWatcher: false }))[0].status, 'info');
  assert.equal(sessItems(facts({ bundled: undefined }))[0].status, 'info');
});

test('install script: a local package installs from its folder after the CRAN packages, with forward slashes', () => {
  const plan = installPlan(sessItems(facts({ packages: pkgs(['processx']), bundled: { path: 'C:\\Users\\s\\sess', revision: REV } })), false);
  const s = installScript(plan, 'https://cloud.r-project.org');
  const cranAt = s.indexOf('install.packages(c("processx")');
  const localAt = s.indexOf('install.packages("C:/Users/s/sess", repos = NULL, type = "source", lib = lib)');
  assert.ok(cranAt > 0 && localAt > cranAt, s);
});
