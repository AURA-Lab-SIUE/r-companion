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

import { buildReport, errorLines, LAST_LINE, RecentLines, redact, reportSections, ReportInput, TERMINAL_NOTE, USER_MARK } from '../src/helpReport';
import { panelTree } from '../src/panelModel';

const WIN = { home: 'C:\\Users\\jdoe7', user: 'jdoe7' };

test('help report: redaction turns the home folder into ~ in every slash style, and the user name into <user>', () => {
  const text = [
    'R: 4.6.1 (C:\\Users\\jdoe7\\AppData\\Local\\Programs\\R\\R-4.6.1\\bin\\Rscript.exe)',
    'lib C:/Users/jdoe7/AppData/Local/R/win-library/4.6',
    'json "c:\\\\users\\\\JDOE7\\\\Documents"',
    'OneDrive - jdoe7 school, signed in as JDoe7',
    'C:\\Users\\jdoe7x\\other stays a different folder',
  ].join('\n');
  const out = redact(text, WIN);
  assert.ok(out.includes('(~\\AppData\\Local\\Programs\\R\\R-4.6.1\\bin\\Rscript.exe)'), out);
  assert.ok(out.includes('lib ~/AppData/Local/R/win-library/4.6'), out);
  assert.ok(out.includes('json "~\\\\Documents"'), out);
  assert.ok(out.includes(`OneDrive - ${USER_MARK} school, signed in as ${USER_MARK}`), out);
  assert.ok(out.includes('C:\\Users\\jdoe7x\\other'), 'a longer name that only starts with the user name is left alone');
  assert.doesNotMatch(out.replace('jdoe7x', ''), /jdoe7/i);
  assert.equal(redact('/Users/sam/Library/R and sam', { home: '/Users/sam', user: 'sam' }), `~/Library/R and ${USER_MARK}`);
});

test('help report: the last 50 lines of the output channel, split across appends', () => {
  const r = new RecentLines(5);
  r.add('one\ntw');
  r.add('o\nthree\n');
  for (const n of ['4', '5', '6']) r.add(n + '\n');
  r.add('partial');
  // keeps 5 complete lines, plus the line still being written
  assert.deepEqual(r.last(10), ['two', 'three', '4', '5', '6', 'partial']);
  assert.deepEqual(r.last(2), ['6', 'partial']);
});

test('help report: only error and warning lines from the R extension logs, the last n', () => {
  const lines = errorLines(
    [
      { file: 'a/window1/R Language Server.log', text: 'started\n[Error] read ECONNRESET\nok' },
      { file: 'b/window1/exthost.log', text: "2026 [warning] Cannot activate extension 'REditorSupport.r'\ninfo line" },
    ],
    50,
  );
  assert.deepEqual(lines, ['a/window1/R Language Server.log: [Error] read ECONNRESET', "b/window1/exthost.log: 2026 [warning] Cannot activate extension 'REditorSupport.r'"]);
  assert.equal(errorLines([{ file: 'x', text: Array.from({ length: 80 }, (_, i) => `error ${i}`).join('\n') }], 50).length, 50);
});

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  when: new Date(2026, 9, 23, 17, 0),
  setup: 'AURA Lab R Companion: setup check for MC 451\n  [MISSING] sess: not installed',
  os: 'Windows_NT 10.0.26200 (x64)',
  vscode: '1.142.0 (Visual Studio Code)',
  companion: '0.5.4',
  rExtension: '3.2.0',
  r: { version: '4.6.1', path: 'C:\\Users\\jdoe7\\R\\Rscript.exe', source: 'the Windows registry' },
  libPaths: ['C:/Users/jdoe7/AppData/Local/R/win-library/4.6', 'C:/Program Files/R/R-4.6.1/library'],
  packages: [
    { name: 'sess', version: '3.2.0', revision: REV },
    { name: 'languageserver', version: null },
  ],
  attach: ['R extension session API: available (vscode-R 3.2.0 or newer)'],
  companionLog: Array.from({ length: 70 }, (_, i) => `log ${i}`),
  rExtensionLog: [],
  ...over,
});

test('help report: six labeled sections in order, with every version line the instructor asks for', () => {
  const s = reportSections(input());
  assert.deepEqual(s.map((x) => x.title.replace(/ \(.*$/, '')), [
    '1. Check my setup',
    '2. Versions',
    '3. Connection between R and VS Code',
    '4. R Companion log',
    '5. R extension log: errors and warnings',
    '6. Errors in the R terminal',
  ]);
  const v = s[1].body.join('\n');
  for (const want of ['Operating system: Windows_NT', 'VS Code: 1.142.0', 'R Companion: 0.5.4', 'R extension (REditorSupport.r): 3.2.0', 'R: 4.6.1, found through the Windows registry', 'R libraries (.libPaths()):', 'sess: 3.2.0 (revision 25da801)', 'languageserver: not installed']) {
    assert.ok(v.includes(want), want);
  }
  assert.equal(s[3].body.length, 50);
  assert.equal(s[3].body[0], 'log 20');
  assert.deepEqual(s[4].body, ['(none found)']);
  assert.deepEqual(s[5].body, [TERMINAL_NOTE]);
  assert.match(reportSections(input({ rExtension: undefined }))[1].body.join('\n'), /REditorSupport\.r\): not installed or turned off/);
});

test('help report: the whole text is redacted, carries no em dash, and ends with the email line', () => {
  const text = buildReport(input(), WIN);
  assert.doesNotMatch(text, /jdoe7/i);
  assert.ok(text.includes('~/AppData/Local/R/win-library/4.6'));
  assert.ok(text.includes('== 2. Versions =='));
  assert.equal(text.trim().split('\n').pop(), LAST_LINE);
  assert.match(LAST_LINE, /email to Dr\. Leith/);
  assert.doesNotMatch(text, /\u2014/);
});

test('help report: a node in the AURA panel Help section', () => {
  const help = panelTree({ course: 'mc451', items: [], crossCheck: false, banners: [] }).find((n) => n.id === 'help')!;
  const node = help.children!.find((c) => c.id === 'help/report')!;
  assert.equal(node.label, 'Make a help report');
  assert.deepEqual(node.command, { command: 'auraR.makeHelpReport' });
  assert.ok(pkg.contributes.commands.some((c: any) => c.command === 'auraR.makeHelpReport' && c.title === 'Make a help report' && c.category === 'AURA'));
});

import { buildChecklist, isFailing, QUARTO_EXT_ID, ProbeResult } from '../src/checklist';
import { PROFILES } from '../src/profiles';

const probe461: ProbeResult = {
  r: { version: '4.6.1', string: 'R version 4.6.1', home: 'C:/R', platform: PLATFORM },
  libPaths: ['C:/R/lib'],
  libWritable: [true],
  userLib: 'C:/R/lib',
  packages: [],
  quarto: 'C:/quarto.exe',
  git: 'C:/git.exe',
  v2vSetup: { lines: null, error: 'v2v is not installed' },
};
const extra = { rscript: 'C:/R/Rscript.exe', rSource: 'PATH', vscodeRInstalled: true, vscodeRVersion: '3.2.0', inPositron: false };
const quartoRow = (course: 'mc427' | 'mc451' | 'mc501', more: object) =>
  buildChecklist(PROFILES[course], probe461, { ...extra, ...more }).find((i) => i.name === 'Quarto extension for VS Code');

test('Quarto extension row: MC 451 and MC 501 only, MISSING with a Show button when absent or off, OK when on', () => {
  for (const c of ['mc451', 'mc501'] as const) {
    const off = quartoRow(c, { quartoExtension: false })!;
    assert.equal(off.status, 'missing');
    assert.ok(isFailing(off));
    assert.equal(off.showExtension, QUARTO_EXT_ID);
    assert.equal(off.installableExtension, undefined, 'installing alone cannot enable a turned-off extension');
    assert.match(off.detail, /Install or Enable/);
    const on = quartoRow(c, { quartoExtension: true })!;
    assert.equal(on.status, 'ok');
    assert.equal(on.showExtension, undefined);
  }
  assert.equal(quartoRow('mc427', { quartoExtension: false }), undefined, 'MC 427 does not use Quarto');
  assert.equal(quartoRow('mc451', { quartoExtension: false, inPositron: true }), undefined, 'Positron has its own Quarto support');
  assert.equal(quartoRow('mc451', {}), undefined, 'not checked when the host did not say');
});

test('install script: a local package installs from its folder after the CRAN packages, with forward slashes', () => {
  const plan = installPlan(sessItems(facts({ packages: pkgs(['processx']), bundled: { path: 'C:\\Users\\s\\sess', revision: REV } })), false);
  const s = installScript(plan, 'https://cloud.r-project.org');
  const cranAt = s.indexOf('install.packages(c("processx")');
  const localAt = s.indexOf('install.packages("C:/Users/s/sess", repos = NULL, type = "source", lib = lib)');
  assert.ok(cranAt > 0 && localAt > cranAt, s);
});
