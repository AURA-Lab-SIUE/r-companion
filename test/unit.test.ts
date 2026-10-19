// Unit tests for the pure modules (no VS Code needed). Run with: npm test
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { PROFILES, compareVersions } from '../src/profiles';
import { discoverR, newestRFolder, rscriptBeside, DiscoveryEnv } from '../src/rDiscovery';
import { buildChecklist, installPlan, parseProbeOutput, ProbeResult, renderText, v2vSetupItems } from '../src/checklist';
import { explain, ERROR_TABLE } from '../src/errors';
import { parseRelease } from '../src/update';
import { installScript } from '../src/installScript';
import { mergeRecommendations, SELF_ID } from '../src/courseFiles';

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
