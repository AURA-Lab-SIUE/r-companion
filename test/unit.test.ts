// Unit tests for the pure modules (no VS Code needed). Run with: npm test
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { PROFILES, compareVersions, courseSetMessage } from '../src/profiles';
import { discoverR, newestRFolder, rscriptBeside, DiscoveryEnv } from '../src/rDiscovery';
import { buildChecklist, extensionPlan, installPlan, parseProbeOutput, ProbeResult, renderText, v2vSetupItems, VSCODE_R_ID, versionBelow } from '../src/checklist';
import { TrustGate, TrustHost, TRUST_BUTTON, PENDING_MS } from '../src/trustGate';
import { explain, ERROR_TABLE } from '../src/errors';
import { parseRelease } from '../src/update';
import { installScript } from '../src/installScript';
import { mergeRecommendations, SELF_ID } from '../src/courseFiles';
import { parseCsv, writeCsv, csvField, inferType } from '../src/csv';
import { chooseRowId, ROW_ID } from '../src/dataTypes';
import { buildLoaded, stringifyCell } from '../src/dataSource';
import { serializeCodes, parseCodes, CodeStore, CODES_HEADER } from '../src/codesStore';
import { rebuildChunk } from '../src/rebuild';
import { webviewHtml } from '../src/gridHtml';

function fakeEnv(files: string[], over: Partial<DiscoveryEnv> = {}): DiscoveryEnv {
  const set = new Set(files.map((f) => f.toLowerCase()));
  return {
    platform: 'win32',
    pathVar: '',
    exists: (p) => set.has(p.toLowerCase()),
    registryInstallPaths: () => [],
    listDir: () => [],
    env: {},
    ...over,
  };
}

test('compareVersions orders numerically', () => {
  assert.equal(compareVersions('4.10.0', '4.9.1'), 1);
  assert.equal(compareVersions('0.3.0', '0.3.2'), -1);
  assert.equal(compareVersions('4.2.0', '4.2'), 0);
});

test('newestRFolder picks the highest version', () => {
  assert.equal(newestRFolder(['R-4.5.1', 'R-4.10.0', 'R-4.6.1', 'other']), 'R-4.10.0');
  assert.equal(newestRFolder([]), undefined);
});

test('rscriptBeside resolves R.exe, a bin folder, and an install folder', () => {
  const files = ['C:\\Program Files\\R\\R-4.6.1\\bin\\Rscript.exe', 'C:\\Program Files\\R\\R-4.6.1\\bin\\R.exe'];
  const env = fakeEnv(files);
  for (const p of ['C:\\Program Files\\R\\R-4.6.1\\bin\\R.exe', 'C:\\Program Files\\R\\R-4.6.1', '"C:\\Program Files\\R\\R-4.6.1\\bin\\R.exe"']) {
    const c = rscriptBeside(p, 'win32', env.exists);
    assert.equal(c?.rscript, files[0], p);
    assert.equal(c?.rterm, files[1]);
  }
  assert.equal(rscriptBeside('C:\\tools\\radian.exe', 'win32', env.exists), undefined);
});

test('discoverR order: setting, then PATH, then registry, then Program Files', () => {
  const env = fakeEnv(
    [
      'D:\\custom\\R\\bin\\Rscript.exe',
      'C:\\onpath\\Rscript.exe',
      'C:\\Program Files\\R\\R-4.5.2\\bin\\Rscript.exe',
      'C:\\Program Files\\R\\R-4.6.1\\bin\\Rscript.exe',
    ],
    {
      pathVar: 'C:\\Windows;C:\\onpath',
      registryInstallPaths: () => ['C:\\Program Files\\R\\R-4.5.2'],
      listDir: (p) => (p === 'C:\\Program Files\\R' ? ['R-4.5.2', 'R-4.6.1'] : []),
      env: { ProgramFiles: 'C:\\Program Files' },
    },
  );
  const found = discoverR({ auraRPath: 'D:\\custom\\R\\bin\\Rscript.exe' }, env);
  assert.deepEqual(
    found.map((c) => c.source),
    ['the auraR.rPath setting', 'your PATH', 'the Windows registry', 'the standard install folder'],
  );
  assert.equal(found[3].rscript, 'C:\\Program Files\\R\\R-4.6.1\\bin\\Rscript.exe');
});

test('discoverR on a Windows laptop with R only in the registry (installer default)', () => {
  const env = fakeEnv(['C:\\Program Files\\R\\R-4.6.1\\bin\\Rscript.exe'], {
    registryInstallPaths: () => ['C:\\Program Files\\R\\R-4.6.1'],
  });
  assert.equal(discoverR({}, env)[0]?.source, 'the Windows registry');
});

test('discoverR on macOS finds R.framework', () => {
  const env = fakeEnv(['/Library/Frameworks/R.framework/Resources/bin/Rscript'], { platform: 'darwin' });
  const found = discoverR({}, env);
  assert.equal(found[0]?.rscript, '/Library/Frameworks/R.framework/Resources/bin/Rscript');
});

const probe = (over: Partial<ProbeResult> = {}): ProbeResult => ({
  r: { version: '4.6.1', string: 'R version 4.6.1', home: '/usr/lib/R', platform: 'x86_64-w64-mingw32' },
  libPaths: ['C:/lib'],
  libWritable: [true],
  userLib: 'C:/lib',
  packages: [
    { name: 'tidyverse', installed: true, version: '2.0.0', loads: true, error: null },
    { name: 'effectsize', installed: false, version: null, loads: false, error: null },
  ],
  quarto: null,
  git: 'C:/git.exe',
  v2vSetup: { lines: null, error: null },
  ...over,
});

test('parseProbeOutput ignores noise around the markers', () => {
  const p = probe();
  const text = `Welcome from .Rprofile\n@@AURA_PROBE_BEGIN@@\n${JSON.stringify(p)}\n@@AURA_PROBE_END@@\n`;
  assert.deepEqual(parseProbeOutput(text), p);
  assert.throws(() => parseProbeOutput('Error: nothing'), /did not print/);
});

test('MC 427 checklist: effectsize missing, installable, no Quarto line', () => {
  const items = buildChecklist(PROFILES.mc427, probe(), {
    rscript: 'R',
    rSource: 'PATH',
    vscodeRInstalled: true,
    inPositron: false,
    setupScriptInWorkspace: true,
  });
  const eff = items.find((i) => i.name === 'effectsize');
  assert.equal(eff?.status, 'missing');
  assert.ok(!items.some((i) => i.name === 'Quarto'));
  assert.deepEqual(installPlan(items, false).map((p) => p.name), ['effectsize']);
});

test('MC 451 checklist flags an old v2v as NEEDS UPDATE and plans a GitHub install', () => {
  const items = buildChecklist(
    PROFILES.mc451,
    probe({ packages: [{ name: 'v2v', installed: true, version: '0.3.0', loads: true, error: null }], quarto: 'q' }),
    { rscript: 'R', rSource: 'PATH', vscodeRInstalled: true, inPositron: false },
  );
  const v2v = items.find((i) => i.name === 'v2v');
  assert.equal(v2v?.status, 'outdated');
  const plan = installPlan(items, false);
  assert.ok(plan.some((p) => p.name === 'v2v' && p.source === 'github' && p.repo === 'AURA-Lab-SIUE/v2v-r'));
  assert.ok(!plan.some((p) => p.name === 'quarto'), 'recommended packages wait for the second button');
});

test('MC 451 and MC 501 need v2v 0.3.3 from R2 on: 0.3.2 is NEEDS UPDATE, 0.3.3 is OK', () => {
  for (const course of [PROFILES.mc451, PROFILES.mc501]) {
    const probeAt = (version: string) =>
      probe({ packages: [{ name: 'v2v', installed: true, version, loads: true, error: null }], quarto: 'q' });
    const check = (version: string) =>
      buildChecklist(course, probeAt(version), { rscript: 'R', rSource: 'PATH', vscodeRInstalled: true, inPositron: false });
    const old = check('0.3.2');
    const item = old.find((i) => i.name === 'v2v');
    assert.equal(item?.status, 'outdated');
    assert.ok(renderText(course, probeAt('0.3.2'), old, new Date()).includes('[NEEDS UPDATE] v2v'));
    assert.ok(item?.detail.includes('0.3.3 or newer'));
    const script = installScript(installPlan(old, false), 'https://cloud.r-project.org');
    assert.ok(script.includes('remotes::install_github("AURA-Lab-SIUE/v2v-r", upgrade = "never", force = TRUE, lib = lib)'));
    assert.equal(check('0.3.3').find((i) => i.name === 'v2v')?.status, 'ok');
  }
});

test('v2v::setup() lines become checklist items, and missing packages are installable', () => {
  const lines = [
    '',
    '-- V2V toolchain check -----',
    '-- Required R packages --',
    'v dplyr',
    'x irr (missing)',
    '-- Suggested R packages --',
    '! quarto (missing, recommended)',
    '-- Command-line tools --',
    'x Quarto CLI not found',
    'v Git on PATH (/usr/bin/git)',
  ];
  const items = v2vSetupItems(probe({ v2vSetup: { lines, error: null } }));
  assert.deepEqual(
    items.map((i) => `${i.status}:${i.name}`),
    ['ok:dplyr', 'missing:irr', 'warn:quarto', 'missing:Quarto CLI not found', 'ok:Git on PATH (/usr/bin/git)'],
  );
  assert.equal(items[1].installable?.name, 'irr');
  assert.equal(items[3].installable, undefined, 'a program is never offered to install.packages()');
});

test('error table: every link uses the canonical domain or GitHub, never the github.io mirror', () => {
  for (const e of ERROR_TABLE) {
    if (!e.link) continue;
    assert.ok(!/github\.io/.test(e.link.url), e.id);
    assert.ok(/^https:\/\/(aura-lab\.siue\.edu|github\.com)\//.test(e.link.url), e.id);
  }
});

test('explain matches the messages students paste', () => {
  const cases: [string, string, any?][] = [
    ["Error in library(v2v) : there is no package called 'v2v'", 'no-package-v2v', 'mc451'],
    ["Error in library(tidyverse) : there is no package called ‘tidyverse’", 'no-package', 'mc427'],
    ["Warning message:\npackage 'v2v' is not available for this version of R", 'v2v-not-available', 'mc451'],
    ['Warning: cannot remove prior installation of package ‘rlang’\nWarning: restored ‘rlang’', 'v2v-restored'],
    ['Error: HTTP error 403.\n  API rate limit exceeded for 146.163.1.1.', 'rate-limit'],
    ['Error in cohens_d(mpg ~ am) : could not find function "cohens_d"', 'could-not-find-function', 'mc427'],
    ["cannot open file 'mc427-setup-chek.R': No such file or directory", 'cannot-open-file', 'mc427'],
    ['> [200~print("hi")[201~', 'bracketed-paste'],
    ["R : The term 'R' is not recognized as the name of a cmdlet", 'r-not-recognized'],
    ['Error in library(v2v-r) : object \'r\' not found', 'object-r-not-found', 'mc501'],
  ];
  for (const [text, id, course] of cases) {
    const ids = explain(text, course).map((e) => e.entry.id);
    assert.ok(ids.includes(id), `${id} not matched in: ${text} (got ${ids.join(',')})`);
  }
  // The specific v2v entry replaces the generic one
  assert.ok(!explain("there is no package called 'v2v'", 'mc451').some((e) => e.entry.id === 'no-package'));
  // MC 427 never sees v2v advice
  assert.ok(!explain("there is no package called 'v2v'", 'mc427').some((e) => e.entry.id === 'no-package-v2v'));
});

test('parseRelease compares the tag with the installed version', () => {
  assert.deepEqual(parseRelease({ tag_name: 'v0.2.0', html_url: 'u' }, '0.1.0'), { latest: '0.2.0', newer: true, page: 'u' });
  assert.equal(parseRelease({ tag_name: '0.1.0' }, '0.1.0').newer, false);
  assert.throws(() => parseRelease({}, '0.1.0'));
});

test('install script sets the mirror, never builds from source, uses force for GitHub', () => {
  const script = installScript(
    [
      { name: 'effectsize', why: '', level: 'required', source: 'cran' },
      { name: 'v2v', why: '', level: 'required', source: 'github', repo: 'AURA-Lab-SIUE/v2v-r' },
    ],
    'https://cloud.r-project.org',
  );
  assert.ok(script.includes('options(repos = c(CRAN = "https://cloud.r-project.org"), install.packages.compile.from.sources = "never")'));
  assert.ok(script.includes('install.packages(c("effectsize"), lib = lib)'));
  assert.ok(script.includes('remotes::install_github("AURA-Lab-SIUE/v2v-r", upgrade = "never", force = TRUE, lib = lib)'));
  assert.ok(script.includes('R_LIBS_USER'));
  // Binaries only on Windows and macOS: without this, a pure-R package whose source is newer than
  // CRAN's binary installs from source (toggled on R 4.5.1, 2026-10-19: datawizard 1.4.1 source vs 1.4.0 binary)
  assert.ok(script.includes('if (.Platform$pkgType != "source") options(pkgType = "binary")'));
  assert.ok(script.indexOf('options(pkgType = "binary")') < script.indexOf('install.packages(c("effectsize")'));
  assert.ok(script.includes('install.packages(still, lib = lib, type = "both")'), 'source fallback only for packages with no binary');
});

test('mergeRecommendations keeps the student file and never overwrites a commented one', () => {
  assert.equal(mergeRecommendations(undefined).status, 'created');
  const v2v = '{\n  "recommendations": [\n    "quarto.quarto",\n    "reditorsupport.r",\n    "eamodio.gitlens"\n  ]\n}\n';
  const added = mergeRecommendations(v2v);
  assert.equal(added.status, 'added');
  if (added.status === 'added') {
    assert.deepEqual(JSON.parse(added.text).recommendations, ['quarto.quarto', 'reditorsupport.r', 'eamodio.gitlens', SELF_ID]);
    assert.equal(mergeRecommendations(added.text).status, 'already');
  }
  assert.equal(mergeRecommendations('{\n  // mine\n  "recommendations": []\n}').status, 'unreadable');
});

test('MC 427 report ends with the exact graded SETUP OK line', () => {
  const ok = probe({ packages: [
    { name: 'tidyverse', installed: true, version: '2.0.0', loads: true, error: null },
    { name: 'effectsize', installed: true, version: '1.0.3', loads: true, error: null },
  ] });
  const extra = { rscript: 'R', rSource: 'PATH', vscodeRInstalled: true, inPositron: false };
  const text = renderText(PROFILES.mc427, ok, buildChecklist(PROFILES.mc427, ok, extra), new Date());
  assert.equal(text.split('\n').pop(), 'SETUP OK: R and the course packages are working.');
  const bad = renderText(PROFILES.mc427, probe(), buildChecklist(PROFILES.mc427, probe(), extra), new Date());
  assert.match(bad.split('\n').pop() as string, /^SETUP NOT READY/);
  assert.ok(!renderText(PROFILES.mc451, ok, buildChecklist(PROFILES.mc451, ok, extra), new Date()).includes('SETUP OK'));
});

test('SETUP OK only when every required item is OK: a missing R extension makes MC 427 NOT READY', () => {
  const ok = probe({ packages: [
    { name: 'tidyverse', installed: true, version: '2.0.0', loads: true, error: null },
    { name: 'effectsize', installed: true, version: '1.0.3', loads: true, error: null },
  ] });
  const extra = { rscript: 'R', rSource: 'PATH', vscodeRInstalled: false, inPositron: false };
  const items = buildChecklist(PROFILES.mc427, ok, extra);
  const ext = items.find((i) => i.name === 'R extension for VS Code');
  assert.equal(ext?.status, 'missing');
  assert.deepEqual(extensionPlan(items), [VSCODE_R_ID]);
  const text = renderText(PROFILES.mc427, ok, items, new Date());
  assert.ok(!text.includes('SETUP OK'), 'never SETUP OK while a required line is not OK');
  assert.match(text, /RESULT: 1 item\(s\) to fix: R extension for VS Code\./);
  assert.match(text.split('\n').pop() as string, /^SETUP NOT READY/);
  // In Positron the R extension is replaced by Positron's own R support, so it is not checked
  const pos = buildChecklist(PROFILES.mc427, ok, { ...extra, inPositron: true });
  assert.ok(!pos.some((i) => i.name === 'R extension for VS Code'));
  assert.equal(renderText(PROFILES.mc427, ok, pos, new Date()).split('\n').pop(), 'SETUP OK: R and the course packages are working.');
  // MC 451 and MC 501 need it too (v2v-hub Install R, Step 2)
  for (const c of ['mc451', 'mc501'] as const) {
    assert.equal(buildChecklist(PROFILES[c], ok, extra).find((i) => i.name === 'R extension for VS Code')?.status, 'missing', c);
  }
});

function fakeTrust(trusted: boolean, answer: string | undefined) {
  const calls: string[] = [];
  let t = 0;
  const host: TrustHost & { trusted: boolean; tick(ms: number): void } = {
    trusted,
    isTrusted() { return this.trusted; },
    askModal: async (message, detail, button) => {
      calls.push(`modal:${button}`);
      assert.match(detail, /then select Trust/);
      return answer;
    },
    openTrustPage: async () => { calls.push('trust-page'); },
    now: () => t,
    tick(ms) { t += ms; },
  };
  return { host, calls };
}

test('Restricted Mode: one modal with one button, and the paused action resumes once trust is granted', async () => {
  const { host, calls } = fakeTrust(false, TRUST_BUTTON);
  const gate = new TrustGate(host);
  let ran = 0;
  assert.equal(await gate.require('opening an R terminal', () => ran++), false);
  assert.deepEqual(calls, [`modal:${TRUST_BUTTON}`, 'trust-page']);
  assert.equal(ran, 0, 'nothing runs before trust');
  host.trusted = true;
  gate.granted();
  assert.equal(ran, 1, 'resumes by itself after trust');
  gate.granted();
  assert.equal(ran, 1, 'runs once');
  assert.equal(await gate.require('x', () => ran++), true, 'a trusted folder asks nothing');
  assert.equal(calls.length, 2);
});

test('Restricted Mode: closing the modal drops the action, and a stale one never starts by surprise', async () => {
  const closed = fakeTrust(false, undefined);
  const g1 = new TrustGate(closed.host);
  let ran = 0;
  await g1.require('x', () => ran++);
  assert.deepEqual(closed.calls, [`modal:${TRUST_BUTTON}`], 'no trust page when the student closes the modal');
  g1.granted();
  assert.equal(ran, 0);
  const late = fakeTrust(false, TRUST_BUTTON);
  const g2 = new TrustGate(late.host);
  await g2.require('x', () => ran++);
  late.host.tick(PENDING_MS + 1);
  g2.granted();
  assert.equal(ran, 0);
});

test('walkthrough steps complete on success context keys, never on a button press', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  const steps = pkg.contributes.walkthroughs[0].steps as { id: string; completionEvents: string[] }[];
  for (const st of steps) {
    assert.ok(st.completionEvents.length > 0, st.id);
    for (const ev of st.completionEvents) {
      assert.ok(ev.startsWith('onContext:'), `${st.id}: ${ev}`);
    }
  }
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');
  for (const key of ['auraR.done.course', 'auraR.done.setupOk', 'auraR.done.workspace', 'auraR.done.help']) {
    assert.ok(steps.some((st) => st.completionEvents.includes(`onContext:${key}`)), key);
    assert.ok(src.includes(`'${key}'`), `${key} is set by the extension`);
  }
});

test('the course-set notification fits on one line', () => {
  for (const p of Object.values(PROFILES)) {
    const m = courseSetMessage(p);
    assert.ok(m.length <= 45, `${m.length}: ${m}`);
    assert.ok(m.includes(p.short));
  }
});

test('media/icon.png (the listing image) is a 128x128 PNG', () => {
  const b = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'icon.png'));
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG');
  assert.equal(b.readUInt32BE(16), 128);
  assert.equal(b.readUInt32BE(20), 128);
});

// ---------- data viewer: CSV, types, row id, codes, rebuild ----------

test('parseCsv handles quotes, embedded commas, newlines, and CRLF', () => {
  const text = 'a,b,c\r\n1,"x,y","line\nbreak"\r\n2,"she said ""hi""",z\r\n';
  const { header, rows } = parseCsv(text);
  assert.deepEqual(header, ['a', 'b', 'c']);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ['1', 'x,y', 'line\nbreak']);
  assert.deepEqual(rows[1], ['2', 'she said "hi"', 'z']);
});

test('parseCsv drops a blank trailing line but keeps empty fields', () => {
  const { header, rows } = parseCsv('a,b\n1,\n');
  assert.deepEqual(header, ['a', 'b']);
  assert.deepEqual(rows, [['1', '']]);
});

test('writeCsv round-trips through parseCsv', () => {
  const header = ['id', 'note'];
  const rows = [['1', 'has, comma'], ['2', 'has "quote"'], ['3', 'plain']];
  const back = parseCsv(writeCsv(header, rows));
  assert.deepEqual(back.header, header);
  assert.deepEqual(back.rows, rows);
});

test('csvField quotes only when it must', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField(''), '');
});

test('inferType reads integer, number, date, logical, and text', () => {
  assert.equal(inferType(['1', '2', '3']), 'integer');
  assert.equal(inferType(['1.5', '2', '']), 'number');
  assert.equal(inferType(['2026-10-19', '2026-01-01']), 'date');
  assert.equal(inferType(['TRUE', 'false']), 'logical');
  assert.equal(inferType(['1', 'two']), 'text');
  assert.equal(inferType(['', '']), 'text');
});

test('chooseRowId reuses a unique row_id column, else synthesizes', () => {
  assert.deepEqual(chooseRowId(['row_id', 'x'], [['1', 'a'], ['2', 'b']]), { field: ROW_ID, synthesize: false });
  // duplicate -> synthesize
  assert.deepEqual(chooseRowId(['row_id', 'x'], [['1', 'a'], ['1', 'b']]), { field: ROW_ID, synthesize: true });
  // blank -> synthesize
  assert.deepEqual(chooseRowId(['row_id'], [['1'], ['']]), { field: ROW_ID, synthesize: true });
  // absent -> synthesize
  assert.deepEqual(chooseRowId(['x', 'y'], [['a', 'b']]), { field: ROW_ID, synthesize: true });
});

test('buildLoaded synthesizes row_id as the first column with 1..n', () => {
  const d = buildLoaded('sample', '/tmp/sample.csv', 'csv', { header: ['msg', 'n'], rows: [['hi', '5'], ['yo', '7']] });
  assert.equal(d.addedRowId, true);
  assert.equal(d.columns[0].field, ROW_ID);
  assert.equal(d.columns[0].type, 'integer');
  assert.deepEqual(d.rows[0], { row_id: '1', msg: 'hi', n: '5' });
  assert.deepEqual(d.rows[1], { row_id: '2', msg: 'yo', n: '7' });
});

test('buildLoaded keeps an existing unique row_id and does not add one', () => {
  const d = buildLoaded('s', '/tmp/s.csv', 'csv', { header: ['row_id', 'msg'], rows: [['7', 'a'], ['8', 'b']] });
  assert.equal(d.addedRowId, false);
  assert.equal(d.columns.length, 2);
  assert.equal(d.columns[0].field, ROW_ID);
  assert.equal(d.rows[0].row_id, '7');
});

test('stringifyCell matches read_csv printing for logicals and blanks', () => {
  assert.equal(stringifyCell(true), 'TRUE');
  assert.equal(stringifyCell(false), 'FALSE');
  assert.equal(stringifyCell(null), '');
  assert.equal(stringifyCell(undefined), '');
  assert.equal(stringifyCell(42), '42');
});

test('serializeCodes writes the long header and sorts stably', () => {
  const text = serializeCodes([
    { rowId: '2', column: 'tone', value: 'neg', codedAt: 't2' },
    { rowId: '10', column: 'tone', value: 'pos', codedAt: 't10' },
    { rowId: '1', column: 'tone', value: 'pos', codedAt: 't1' },
  ]);
  const { header, rows } = parseCsv(text);
  assert.deepEqual(header, CODES_HEADER);
  assert.deepEqual(rows.map((r) => r[0]), ['1', '2', '10']); // numeric order, not lexical
});

test('parseCodes reads back what serializeCodes wrote', () => {
  const recs = [{ rowId: '1', column: 'tone', value: 'pos, maybe', codedAt: '2026-10-19T00:00:00Z' }];
  assert.deepEqual(parseCodes(serializeCodes(recs)), recs);
});

test('CodeStore set, clear, round-trip through an atomic save', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-codes-'));
  const file = path.join(dir, 'x-codes.csv');
  const store = new CodeStore(file);
  store.set('1', 'tone', 'pos', 't1');
  store.set('2', 'tone', 'neg', 't2');
  store.set('1', 'topic', 'news', 't3');
  store.save();
  assert.ok(fs.existsSync(file));
  const reloaded = CodeStore.load(file);
  assert.deepEqual(reloaded.rowValues('1'), { tone: 'pos', topic: 'news' });
  assert.deepEqual(reloaded.columnsWithData(), ['tone', 'topic']);
  // clearing removes the record
  reloaded.set('1', 'tone', '', 't4');
  reloaded.save();
  assert.deepEqual(CodeStore.load(file).rowValues('1'), { topic: 'news' });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rebuildChunk follows the house style and adds row_number only when needed', () => {
  const added = rebuildChunk({
    dataRelPath: 'data/sample.csv',
    codesRelPath: 'data/derived/sample-codes.csv',
    addedRowId: true,
    origin: 'csv',
    codingColumns: ['tone', 'topic'],
  });
  assert.ok(added.includes('library(tidyverse)'));
  assert.ok(added.includes('read_csv("data/sample.csv")'));
  assert.ok(added.includes('mutate(row_id = as.character(row_number()))'));
  assert.ok(added.includes('pivot_wider('));
  assert.ok(added.includes('left_join(wide_codes, by = "row_id")'));
  assert.ok(added.includes('tone, topic'));
  // one verb per line after each pipe: no two %>% on the same line
  for (const line of added.split('\n')) assert.ok((line.match(/%>%/g) || []).length <= 1, line);

  const existing = rebuildChunk({
    dataRelPath: 'd.csv',
    codesRelPath: 'c.csv',
    addedRowId: false,
    origin: 'csv',
    codingColumns: [],
  });
  assert.ok(existing.includes('mutate(row_id = as.character(row_id))'));
  assert.ok(!existing.includes('row_number()'));
});

// ---------- coding sheet keys (0.4.1) ----------

test('data viewer: the hint names the real keys, and the CSP lets AG Grid load its icon font', () => {
  const html = webviewHtml({ nonce: 'n', cspSource: 'vscode-resource:', agGridJs: 'a.js', agGridCss: 'a.css', themeCss: 't.css', gridCss: 'g.css', gridJs: 'g.js', title: 'T' });
  const help = html.slice(html.indexOf('id="aura-help"')).split('</p>')[0].replace(/\s+/g, ' ');
  assert.match(help, /type the first letters of a code and press Enter to save it and move down/);
  assert.match(help, /Tab to save it and move right/);
  assert.match(help, /Escape cancels, F2 or a double-click shows the whole list, and Delete clears a cell/);
  assert.match(html, /font-src vscode-resource: data:/);
});

test('coding sheet: code list columns use the typeahead editor, not the AG Grid select', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'grid', 'grid.js'), 'utf8');
  assert.match(js, /def\.cellEditor = CodeListEditor;/);
  assert.doesNotMatch(js, /agSelectCellEditor/);
  assert.match(js, /suppressKeyboardEvent: codingKeyboard/);
});

test('MC 501: lm.beta is required, reported missing by Check my setup, and installed from CRAN', () => {
  const spec = PROFILES.mc501.packages.find((p) => p.name === 'lm.beta');
  assert.equal(spec?.level, 'required');
  assert.equal(spec?.source, 'cran');
  const items = buildChecklist(
    PROFILES.mc501,
    probe({ packages: [{ name: 'lm.beta', installed: false, version: null, loads: false, error: null }], quarto: 'q' }),
    { rscript: 'R', rSource: 'PATH', vscodeRInstalled: true, inPositron: false },
  );
  assert.equal(items.find((i) => i.name === 'lm.beta')?.status, 'missing');
  const plan = installPlan(items, false);
  assert.ok(plan.some((p) => p.name === 'lm.beta' && p.source === 'cran'));
  assert.ok(installScript(plan, 'https://cloud.r-project.org').includes('"lm.beta"'));
  // Only MC 501's regression writes the standardized slope
  assert.ok(!PROFILES.mc451.packages.some((p) => p.name === 'lm.beta'));
  assert.ok(!PROFILES.mc427.packages.some((p) => p.name === 'lm.beta'));
});

// 0.5.3 (#rgui Rank 3b): vscode-R before 3.0.0 never attaches to R 4.6, so Check my setup reads
// its version, says NEEDS UPDATE below 3.0.0, and never prints SETUP OK beside it.
test('0.5.3: the R extension line carries its version and needs 3.0.0 or newer', () => {
  assert.equal(versionBelow('2.8.8', '3.0.0'), true);
  assert.equal(versionBelow('3.0.0', '3.0.0'), false);
  assert.equal(versionBelow('3.3.20261018', '3.0.0'), false);
  assert.equal(versionBelow('2.99', '3.0.0'), true);
  const ok = probe({ packages: [
    { name: 'tidyverse', installed: true, version: '2.0.0', loads: true, error: null },
    { name: 'effectsize', installed: true, version: '1.0.3', loads: true, error: null },
  ] });
  const old = { rscript: 'R', rSource: 'PATH', vscodeRInstalled: true, vscodeRVersion: '2.8.8', inPositron: false };
  const items = buildChecklist(PROFILES.mc427, ok, old);
  const ext = items.find((i) => i.name === 'R extension for VS Code');
  assert.equal(ext?.status, 'outdated');
  assert.match(ext!.detail, /version 2\.8\.8 is installed, and versions before 3\.0\.0 cannot connect to R 4\.6/);
  assert.deepEqual(extensionPlan(items), [VSCODE_R_ID], 'Install what is missing offers the update');
  const text = renderText(PROFILES.mc427, ok, items, new Date());
  assert.match(text, /\[NEEDS UPDATE\] R extension for VS Code/);
  assert.ok(!text.includes('SETUP OK'));
  const fresh = buildChecklist(PROFILES.mc427, ok, { ...old, vscodeRVersion: '3.2.0' });
  const ext2 = fresh.find((i) => i.name === 'R extension for VS Code');
  assert.equal(ext2?.status, 'ok');
  assert.match(ext2!.detail, /R extension 3\.2\.0 is installed/);
  assert.equal(renderText(PROFILES.mc427, ok, fresh, new Date()).split('\n').pop(), 'SETUP OK: R and the course packages are working.');
});
