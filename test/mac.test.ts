// 0.7.1 Mac readiness audit (2026-11-06): the library() dedupe, the r.bracketedPaste guard, the Mac
// spelling of the stray-marker error, and the Mac-only setup rows. Pure modules, no VS Code.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { skipLoadedLibraries, loadedPackages, onlyComments, prepareInsert } from '../src/insert';
import { pasteScopesToClear, pasteGuardMessage, isRadian } from '../src/pasteGuard';
import { explain } from '../src/errors';
import { buildChecklist, macItems, ProbeResult, isFailing } from '../src/checklist';
import { PROFILES } from '../src/profiles';
import { TASK_RELEASE, generate, hasTask, GenProfile } from '../src/codegen';

// ---- library() lines ----

const IMPORT = [
  '# ---- Load the tidyverse and your data file ----',
  '# Load the tidyverse once, at the top of the script. It prints a list of',
  '# packages with check marks and two "masks" lines; both are normal.',
  'library(tidyverse)',
  '',
  'df <- read_csv("data.csv")',
].join('\n');

test('a block keeps its library() line in an empty script', () => {
  const r = skipLoadedLibraries(IMPORT, '');
  assert.equal(r.code, IMPORT);
  assert.deepEqual(r.skipped, []);
});

test('a library() line already above the cursor is left out, with its Load comment', () => {
  const r = skipLoadedLibraries(IMPORT, 'library(tidyverse)\n\nchat <- read_csv("chat.csv")\n');
  assert.deepEqual(r.skipped, ['tidyverse']);
  assert.equal(r.code, ['# ---- Load the tidyverse and your data file ----', 'df <- read_csv("data.csv")'].join('\n'));
  assert.doesNotMatch(r.code, /library\(/);
});

test('only the packages already loaded are left out', () => {
  const block = ['# ---- Settings ----', '# effectsize adds effect sizes.', 'library(tidyverse)', 'library(effectsize)', '', 'x <- 1'].join('\n');
  const r = skipLoadedLibraries(block, 'library(tidyverse)\n');
  assert.deepEqual(r.skipped, ['tidyverse']);
  // The comment explains effectsize, which stays, so the comment stays too
  assert.equal(r.code, ['# ---- Settings ----', '# effectsize adds effect sizes.', 'library(effectsize)', '', 'x <- 1'].join('\n'));
});

test('a Load comment above a run that keeps one library() line goes too', () => {
  const block = ['# ---- Load the course data ----', '# Load both packages once, at the top of the script.', 'library(tidyverse)', 'library(v2v)', '', 'chat <- twitch_chat()'].join('\n');
  const r = skipLoadedLibraries(block, 'library(tidyverse)\n');
  assert.equal(r.code, ['# ---- Load the course data ----', 'library(v2v)', '', 'chat <- twitch_chat()'].join('\n'));
});

test('a comment that is not a Load comment stays when its library() line goes', () => {
  const block = ['# ---- Power ----', '# pwr.t.test() solves for the sample size.', 'library(pwr)', '', 'pwr.t.test(d = 0.5)'].join('\n');
  const r = skipLoadedLibraries(block, 'library("pwr")  # loaded earlier\n');
  assert.deepEqual(r.skipped, ['pwr']);
  assert.equal(r.code, ['# ---- Power ----', '# pwr.t.test() solves for the sample size.', 'pwr.t.test(d = 0.5)'].join('\n'));
});

test('require() counts as loaded, and a mention in a comment or string does not', () => {
  assert.deepEqual([...loadedPackages('require(tidyverse)\n# library(v2v)\nx <- "library(dplyr)"\n')], ['tidyverse']);
});

test('a block that repeats its own library() line keeps the first', () => {
  const r = skipLoadedLibraries('library(tidyverse)\nx <- 1\nlibrary(tidyverse)\ny <- 2', '');
  assert.deepEqual(r.skipped, ['tidyverse']);
  assert.equal(r.code, 'library(tidyverse)\nx <- 1\ny <- 2');
});

test('every Write R code template inserted twice into one script loads each package once', () => {
  let checked = 0;
  for (const profile of ['mc427', 'mc451', 'mc501'] as GenProfile[]) for (const task of Object.keys(TASK_RELEASE)) {
    if (!hasTask(profile, task)) continue;
    const id = `${profile}/${task}`;
    let code: string;
    try {
      code = generate(profile, task, {});
    } catch {
      continue;
    }
    if (typeof code !== 'string' || !/library\(/.test(code)) continue;
    const second = skipLoadedLibraries(code, code);
    const script = code + '\n\n' + second.code;
    for (const pkg of loadedPackages(code)) {
      const n = script.split('\n').filter((l) => new RegExp(`^\\s*library\\(${pkg.replace('.', '\\.')}\\)`).test(l)).length;
      assert.equal(n, 1, `${id}: library(${pkg}) appears ${n} times`);
    }
    assert.ok(!onlyComments(second.code) || !/[^\s#]/.test(second.code.replace(/^\s*#.*$/gm, '')), id);
    checked++;
  }
  assert.ok(checked >= 5, `only ${checked} templates carried library() lines`);
});

test('a Quarto insert of a trimmed block still wraps it in a chunk', () => {
  const r = skipLoadedLibraries(IMPORT, '```{r}\nlibrary(tidyverse)\n```\n');
  const plan = prepareInsert(r.code, true, false);
  assert.equal(plan.wrappedInChunk, true);
  assert.doesNotMatch(plan.text, /library\(tidyverse\)/);
});

// ---- r.bracketedPaste guard ----

test('the guard clears every scope that sets bracketed paste on', () => {
  assert.deepEqual(pasteScopesToClear({ globalValue: false, workspaceValue: true }, ''), ['workspace']);
  assert.deepEqual(pasteScopesToClear({ globalValue: true, workspaceValue: true, workspaceFolderValue: true }, undefined), [
    'folder',
    'workspace',
    'user',
  ]);
  assert.deepEqual(pasteScopesToClear({ globalValue: false }, ''), []);
  assert.deepEqual(pasteScopesToClear(undefined, ''), []);
});

test('the guard leaves radian alone', () => {
  assert.equal(isRadian('/Users/x/.local/bin/radian'), true);
  assert.deepEqual(pasteScopesToClear({ workspaceValue: true }, '/opt/homebrew/bin/radian'), []);
});

test('the guard message names the place and both spellings of the symptom', () => {
  const m = pasteGuardMessage(['workspace']);
  assert.match(m, /this folder's settings/);
  assert.match(m, /00~ and 01~ on a Mac/);
  assert.match(m, /\[200~ and \[201~ on Windows/);
});

// ---- the Mac spelling of the error (m4, CRAN R 4.6.2, readline 5.2) ----

test('the stray-marker explanation matches what a Mac prints', () => {
  // Captured from the R (AURA) terminal on m4, 2026-11-06, with the bell characters
  const mac = '> \x0700~x <- 1 + 1; print(x)\x0701~\nError in 0 ~ x <- 1 + 1 : \n  target of assignment expands to non-language object';
  assert.equal(explain(mac)[0]?.entry.id, 'bracketed-paste');
  // The same with the bells stripped, as a copied terminal shows it
  assert.equal(explain('> 00~library(tidyverse)01~')[0]?.entry.id, 'bracketed-paste');
  assert.equal(explain('> [200~print("hi")[201~')[0]?.entry.id, 'bracketed-paste');
});

test('the Mac pattern does not fire on ordinary numbers or formulas', () => {
  for (const s of ['[1] 200', 'lm(y ~ x)', 'x <- 2001', 'count = 100']) {
    assert.notEqual(explain(s)[0]?.entry.id, 'bracketed-paste', s);
  }
});

// ---- Mac setup rows ----

function probe(over: Partial<ProbeResult> = {}): ProbeResult {
  return {
    r: { version: '4.6.2', string: 'R version 4.6.2', home: '/Library/Frameworks/R.framework/Resources', platform: 'aarch64-apple-darwin23' },
    libPaths: ['/Library/Frameworks/R.framework/Versions/4.6/Resources/library'],
    libWritable: [true],
    userLib: null,
    packages: [],
    quarto: '/usr/local/bin/quarto',
    git: '/usr/bin/git',
    v2vSetup: { lines: null, error: 'v2v is not installed' },
    ...over,
  };
}
const extra = { rscript: '/usr/local/bin/Rscript', rSource: 'your PATH', vscodeRInstalled: true, vscodeRVersion: '3.2.2', inPositron: false };

test('without the Command Line Tools, /usr/bin/git on a Mac is not counted as Git', () => {
  const items = buildChecklist(PROFILES.mc451, probe({ mac: { xquartz: true, clt: false, appleSilicon: true } }), extra);
  const git = items.find((i) => i.name === 'Git');
  assert.ok(git && isFailing(git));
  assert.match(git!.detail, /xcode-select --install/);
  // With the tools, the same path is fine
  const ok = buildChecklist(PROFILES.mc451, probe({ mac: { xquartz: true, clt: true, appleSilicon: true } }), extra).find((i) => i.name === 'Git');
  assert.equal(ok?.status, 'ok');
});

test('XQuartz missing is a warning with the install link, never a failure', () => {
  const x = macItems({ xquartz: false, clt: true, appleSilicon: true }, 'aarch64-apple-darwin23', true).find((i) => i.name === 'XQuartz');
  assert.equal(x?.status, 'warn');
  assert.match(x!.detail, /https:\/\/www\.xquartz\.org/);
  assert.match(x!.detail, /View\(\)/);
});

test('an Intel R on an Apple silicon Mac is flagged; an arm64 R is not', () => {
  assert.ok(macItems({ xquartz: true, clt: true, appleSilicon: true }, 'x86_64-apple-darwin20', true).some((i) => i.name === 'R for Apple silicon'));
  assert.ok(!macItems({ xquartz: true, clt: true, appleSilicon: true }, 'aarch64-apple-darwin23', true).some((i) => i.name === 'R for Apple silicon'));
  assert.ok(!macItems({ xquartz: true, clt: true, appleSilicon: false }, 'x86_64-apple-darwin20', true).some((i) => i.name === 'R for Apple silicon'));
});

test('Windows and Linux probes (mac null or absent) get no Mac rows', () => {
  for (const mac of [null, undefined]) {
    const items = buildChecklist(PROFILES.mc451, probe({ mac, git: 'C:/Program Files/Git/cmd/git.exe' }), extra);
    assert.ok(!items.some((i) => ['XQuartz', 'Command Line Tools', 'R for Apple silicon'].includes(i.name)));
  }
});

test('bracketed paste left on shows as a broken VS Code row with the Workspace-tab fix', () => {
  const items = buildChecklist(PROFILES.mc451, probe({ mac: null }), { ...extra, bracketedPasteOn: ['Workspace'] });
  const row = items.find((i) => i.name === 'R: Bracketed Paste');
  assert.ok(row && isFailing(row));
  assert.match(row!.detail, /Workspace tab/);
  assert.ok(!buildChecklist(PROFILES.mc451, probe({ mac: null }), extra).some((i) => i.name === 'R: Bracketed Paste'));
});
