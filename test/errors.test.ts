// Per-entry tests for the error explainer: one real message per entry, plus a test that no two
// entries match the same message ambiguously. The messages are the exact text R 4.6.1, Git, or
// Quarto prints (reproduced in Rscript during Phase 2), or the exact "Common Errors" deck and
// `?v2v::common_errors` wording for the symptom-only cases. See src/errors.ts for sources.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { explain, ERROR_TABLE, explanationMarkdown } from '../src/errors';
import { CourseId } from '../src/profiles';

interface Case {
  id: string;
  msg: string;
  course?: CourseId;
  note?: string;
}

// One representative message per entry (several entries carry two phrasings).
const CASES: Case[] = [
  // ---- existing entries ----
  { id: 'bracketed-paste', msg: '> [200~print("hi")[201~' },
  // 0.5.3: the 2026-10-22 student support case and vscode-R issue 1723
  { id: 'r-not-attached', msg: 'Connection to server got closed. Server will not be restarted.' },
  { id: 'r-not-attached', msg: 'Client R Language Server: read ECONNRESET' },
  { id: 'r-not-attached', msg: 'The status bar says R: (not attached)' },
  { id: 'r-not-attached', msg: 'Error in .vsc.attach() : could not find function ".vsc.attach"' },
  { id: 'v2v-not-available', msg: "package 'v2v' is not available for this version of R", course: 'mc451' },
  { id: 'v2v-restored', msg: "Warning: cannot remove prior installation of package 'rlang'\nWarning: restored 'rlang'" },
  { id: 'no-package-v2v', msg: "Error in library(v2v) : there is no package called 'v2v'", course: 'mc451' },
  { id: 'no-package', msg: "Error in library(tidyverse) : there is no package called 'tidyverse'", course: 'mc427' },
  { id: 'not-available-version', msg: "package 'rlang' is not available (for R version 4.1.0)" },
  { id: 'rate-limit', msg: 'Error: HTTP error 403.\n  API rate limit exceeded for 146.163.1.1.' },
  { id: 'needs-compilation', msg: 'Do you want to install from sources the package which needs compilation? (Yes/no/cancel)' },
  { id: 'file-in-use', msg: 'Error: file is in use' },
  { id: 'help-corrupt', msg: "installed help of package 'v2v' is corrupt" },
  { id: 'could-not-find-function', msg: 'Error in cohens_d(mpg ~ am) : could not find function "cohens_d"', course: 'mc427' },
  { id: 'r-not-recognized', msg: "R : The term 'R' is not recognized as the name of a cmdlet" },
  { id: 'cannot-open-file', msg: "cannot open file 'mc427-setup-chek.R': No such file or directory", course: 'mc427' },
  { id: 'cran-mirror', msg: '--- Please select a CRAN mirror for use in this session ---' },
  { id: 'personal-library', msg: 'Would you like to use a personal library instead?  (yes/No/cancel)' },
  { id: 'update-prompt', msg: 'These packages have more recent versions available.\nEnter one or more numbers, or an empty line to skip updates:' },
  { id: 'object-r-not-found', msg: "Error in library(v2v-r) : object 'r' not found", course: 'mc501' },
  { id: 'git-clone-missing', msg: "'git' is not recognized as an internal or external command" },
  { id: 'plus-prompt', msg: '+ ' },

  // ---- Phase 2 additions: the 30 course messages ----
  // Priority 1
  { id: 'object-not-found', msg: "Error: object 'df' not found", course: 'mc427' },
  { id: 'column-not-found', msg: "Error in select(df, share_buton) : Can't select columns that don't exist.\n✖ Column `share_buton` doesn't exist." },
  { id: 'column-not-found', msg: "Error in count(., share_buton) :\n  Must group by variables found in `.data`.\n✖ Column `share_buton` is not found." },
  // Priority 2: the other MC 427 R00 messages
  { id: 'backslash-U', msg: "Error: '\\U' used without hex digits in character string (<input>:1:14)" },
  { id: 'named-input-equals', msg: "Error in `filter()`:\n! We detected a named input.\nℹ This usually means that you've used `=` instead of `==`.\nℹ Did you mean `update == \"Beyond\"`?" },
  { id: 'log-of-zero', msg: "Error in lm.fit(x, y) : NA/NaN/Inf in 'y'" },
  { id: 'log-of-zero', msg: 'Warning message:\nIn log(c(0, -1, 5)) : NaNs produced' },
  // 0.5.1: the R00 table's t-test of NaN and -Inf, three ways a student pastes it (R 4.6.1)
  { id: 't-test-nan-inf', msg: '\tWelch Two Sample t-test\n\ndata:  log_likes by share_button\nt = NaN, df = NaN, p-value = NA\nalternative hypothesis: true difference in means between group no and group yes is not equal to 0\n95 percent confidence interval:\n NaN NaN\nsample estimates:\n mean in group no mean in group yes \n             -Inf              -Inf ', course: 'mc427' },
  { id: 't-test-nan-inf', msg: ' mean in group no mean in group yes \n             -Inf              -Inf ', course: 'mc427' },
  // The input box drops line breaks, so a two-line selection arrives joined: 'share_buttont = NaN'
  { id: 't-test-nan-inf', msg: 'data:  log_likes by share_buttont = NaN, df = NaN, p-value = NA', course: 'mc427' },
  { id: 't-test-nan-inf', msg: '  estimate estimate1 estimate2 statistic p.value parameter conf.low conf.high\n1      NaN      -Inf      -Inf       NaN     NaN       NaN      NaN       NaN', course: 'mc427' },
  // 0.5.1: R Field Guide C11, mean() on a text column, inside summarize() and on its own (R 4.6.1)
  { id: 'mean-not-numeric', msg: '# A tibble: 1 \u00d7 1\n  average\n    <dbl>\n1      NA\nWarning message:\nThere was 1 warning in `summarize()`.\n\u2139 In argument: `average = mean(pct_gain)`.\nCaused by warning in `mean.default()`:\n! argument is not numeric or logical: returning NA ', course: 'mc427' },
  { id: 'mean-not-numeric', msg: '[1] NA\nWarning message:\nIn mean.default(players$pct_gain) :\n  argument is not numeric or logical: returning NA', course: 'mc451' },
  { id: 'chisq-approximation', msg: 'Warning message:\nIn chisq.test(m) : Chi-squared approximation may be incorrect' },
  // Wrangling and test syntax
  { id: 'unexpected-equals', msg: '<text>:1:5: unexpected \'=\'\n1: x = =\n        ^' },
  { id: 'slice-max-order-by', msg: "Error in `slice_max()`:\n! `order_by` is absent but must be supplied." },
  { id: 't-test-two-levels', msg: 'Error in t.test.formula(v ~ grp, data = d) : grouping factor must have exactly 2 levels' },
  { id: 'not-enough-observations', msg: "Error in t.test.default(x, y) : not enough 'x' observations" },
  { id: 'na-mean', msg: '[1] NA' },
  { id: 'ggplot-missing-plus', msg: '<text>:1:20: unexpected symbol\n1: ggplot(df, aes(a)) geom_histogram\n                       ^' },
  // The five ?v2v::common_errors cases (V2V only)
  { id: 'epoch-ms-year-50888', msg: '# A tibble: 2 × 1\n  ts                  \n  <dttm>              \n1 49503-02-10 02:40:00\n2 52671-12-25 12:26:40', course: 'mc451' },
  { id: 'join-all-na', msg: 'Join produces zero matched rows between chat and streams', course: 'mc451' },
  { id: 'row-count-grew-after-join', msg: 'Row count grew after a join: duplicate keys in the lookup', course: 'mc501' },
  { id: 'setup-quarto-false-alarm', msg: 'x Quarto CLI not found', course: 'mc451' },
  { id: 'kappa-lower-than-expected', msg: "Cohen's kappa is much lower than I expected", course: 'mc451' },
  { id: 'twitch-sample-not-found', msg: "Error in data(twitch_chat_sample) : data set 'twitch_chat_sample' not found", course: 'mc451' },
  // Quarto and Git/GitHub (all courses)
  { id: 'quarto-command-not-found', msg: 'bash: quarto: command not found' },
  { id: 'quarto-check-no-r', msg: 'quarto check says R was not found' },
  { id: 'failed-to-spawn-rscript', msg: "ERROR: Failed to spawn 'Rscript'" },
  { id: 'yaml-render-error', msg: 'ERROR: Render failed due to a YAML error in the front matter' },
  { id: 'unc-share', msg: 'The drive or UNC share does not exist' },
  { id: 'permission-denied-publickey', msg: 'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.' },
  { id: 'author-identity-unknown', msg: 'fatal: unable to auto-detect email address\nAuthor identity unknown' },
  { id: 'repository-not-found', msg: "remote: Repository not found.\nfatal: repository 'https://github.com/x/y.git/' not found" },
  { id: 'merge-conflict', msg: 'CONFLICT (content): Merge conflict in analysis.R\nAutomatic merge failed; fix conflicts and then commit the result.' },
  { id: 'large-files', msg: "remote: error: GH001: Large files detected.\nremote: error: File data.csv is 123.00 MB; this exceeds GitHub's file size limit of 100.00 MB" },
];

test('every error-table entry has at least one real-message test case', () => {
  const tableIds = new Set(ERROR_TABLE.map((e) => e.id));
  const caseIds = new Set(CASES.map((c) => c.id));
  const untested = [...tableIds].filter((id) => !caseIds.has(id));
  assert.deepEqual(untested, [], `entries with no test case: ${untested.join(', ')}`);
  const unknown = [...caseIds].filter((id) => !tableIds.has(id));
  assert.deepEqual(unknown, [], `cases referencing a missing entry: ${unknown.join(', ')}`);
});

test('each entry matches its own real message', () => {
  for (const c of CASES) {
    const ids = explain(c.msg, c.course).map((e) => e.entry.id);
    assert.ok(ids.includes(c.id), `${c.id} did not match its message (got ${ids.join(',') || 'nothing'}): ${c.msg}`);
  }
});

test('no two entries match the same message ambiguously', () => {
  for (const c of CASES) {
    const matches = explain(c.msg, c.course);
    const ids = matches.map((e) => e.entry.id);
    assert.equal(
      matches.length,
      1,
      `message for ${c.id}${c.course ? ' (' + c.course + ')' : ''} matched ${matches.length} entries: ${ids.join(', ')}\n  ${c.msg.replace(/\n/g, ' / ')}`,
    );
    assert.equal(ids[0], c.id, `message for ${c.id} resolved to ${ids[0]}`);
  }
});

test('the matched text is a real substring of the pasted message', () => {
  for (const c of CASES) {
    for (const m of explain(c.msg, c.course)) {
      assert.ok(c.msg.includes(m.matched), `${c.id}: matched text "${m.matched}" is not in the message`);
    }
  }
});

test('MC 427 never sees a v2v-only error entry', () => {
  const v2vOnly = ERROR_TABLE.filter((e) => e.courses && !e.courses.includes('mc427')).map((e) => e.id);
  for (const c of CASES) {
    const ids = explain(c.msg, 'mc427').map((e) => e.entry.id);
    for (const id of ids) assert.ok(!v2vOnly.includes(id), `${id} should be hidden from MC 427 but matched: ${c.msg}`);
  }
});

test('every new entry links to the canonical domain with numbered fix steps', () => {
  for (const e of ERROR_TABLE) {
    assert.ok(e.fix.length >= 1, `${e.id} has no fix steps`);
    if (e.link) assert.ok(/^https:\/\/aura-lab\.siue\.edu\//.test(e.link.url), `${e.id} link is not canonical: ${e.link.url}`);
  }
});

// The Install R page's "Common first-time issues" section covers only R off the PATH, the R
// extension path, a stuck install, and bracketed paste (read live 2026-10-19), so an entry for any
// other message must not send a student there.
test('no entry links to the generic Install R common-issues section', () => {
  for (const e of ERROR_TABLE) {
    if (e.link) assert.ok(!/#common-first-time-issues$/.test(e.link.url), `${e.id} links to a section that does not discuss it`);
  }
});

// 0.5.1: the quick pick cut every Why and Step to one line, so the full explanation opens as a
// Markdown page. Every entry's page must carry the full Why, every step numbered in order, and the
// link, with R code, paths, and Git markers shown as typed (Markdown punctuation escaped).
const unescape = (md: string) => md.replace(/\\([\\`*_{}[\]()<>#+\-.!|~])/g, '$1');

test('every entry renders as a full Markdown page: why, numbered steps, link', () => {
  for (const e of ERROR_TABLE) {
    const md = explanationMarkdown({ entry: e, matched: e.title });
    const plain = unescape(md);
    assert.ok(md.startsWith('# '), e.id);
    assert.ok(plain.includes(`# ${e.title}\n`), `${e.id}: title`);
    assert.ok(plain.includes('## Why this happens\n\n' + e.why + '\n'), `${e.id}: why in full`);
    e.fix.forEach((step, i) => assert.ok(plain.includes(`\n${i + 1}. ${step}\n`), `${e.id}: step ${i + 1} in full`));
    if (e.link) assert.ok(md.includes(`](${e.link.url})`), `${e.id}: link`);
    else assert.ok(!md.includes('## Read more'), `${e.id}: no empty link section`);
    assert.ok(!md.includes('\u2026'), `${e.id}: no ellipsis`);
  }
});

test('the backslash-U page keeps the backslashes and the whole of Step 1', () => {
  const [x] = explain("Error: '\\U' used without hex digits in character string (<input>:1:22)", 'mc451');
  const md = explanationMarkdown(x);
  // The 0.5.0 quick pick ended Step 1 at "put th..."
  assert.ok(unescape(md).includes('put the data file inside it, and read it by name: read_csv("data.csv").'));
  assert.ok(md.includes('C:\\\\Users\\\\data\\.csv'), 'backslashes escaped so they render');
  // The matched text is one line of inline code, shown as the student pasted it
  assert.ok(md.includes("From your message: `'\\U' used without hex digits`\n"));
});

test('Git conflict markers and a pasted backtick run cannot break the page', () => {
  const [x] = explain('CONFLICT (content): Merge conflict in a.R');
  const md = explanationMarkdown(x);
  assert.ok(md.includes('\\<\\<\\<\\<\\<\\<\\<'), 'markers escaped');
  const ticks = explanationMarkdown({ entry: x.entry, matched: 'a ```` b' });
  assert.ok(ticks.includes('From your message: `````a ```` b`````\n'), 'delimiters longer than the backtick run');
  const edge = explanationMarkdown({ entry: x.entry, matched: '`x` doesn\'t\nexist' });
  assert.ok(edge.includes("From your message: `` `x` doesn't exist ``\n"), 'padded at a backtick edge, one line');
});

test('0.5.3: the not-attached messages match that entry and nothing else, and it offers its Fix it', () => {
  for (const msg of [
    'Connection to server got closed. Server will not be restarted.',
    '[Error - 10:14:02 AM] Client R Language Server: read ECONNRESET',
    'R: (not attached)',
    'could not find function ".vsc.attach"',
  ]) {
    assert.deepEqual(explain(msg, 'mc451').map((e) => e.entry.id), ['r-not-attached'], msg);
  }
  const fixes = Object.fromEntries(ERROR_TABLE.filter((e) => e.fixIt).map((e) => [e.id, e.fixIt]));
  assert.deepEqual(fixes, {
    'bracketed-paste': 'turn-off-bracketed-paste',
    'r-not-attached': 'update-r-extension',
    'v2v-restored': 'close-r-and-install',
    'file-in-use': 'close-r-and-install',
  });
  const md = explanationMarkdown(explain('R: (not attached)')[0]);
  assert.ok(md.includes('## Or let the R Companion do it'));
  assert.ok(md.includes('Update the R extension'));
});
