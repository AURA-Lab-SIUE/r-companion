// 0.4.0 tests (#rgui): every release on, Check my test choice, the APA numbers blocks, the Copilot
// tools' text and switch, the fig-alt chunk option, and effectsize required in MC 451 and MC 501.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import { generate, hasTask, APA_TESTS, apaTask, TASK_RELEASE } from '../src/codegen';
import { checkTestChoice, fittingTests, TestId } from '../src/testChoice';
import { copilotToolsOn, explainForModel, testChoiceForModel } from '../src/toolText';
import { prepareInsert, FIG_ALT_OPTION } from '../src/insert';
import { PROFILES } from '../src/profiles';

const ROOT = path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const props = pkg.contributes.configuration.properties;

test('no release gate: auraR.previewReleases is gone and no source reads it', () => {
  assert.equal(props['auraR.previewReleases'], undefined);
  for (const f of fs.readdirSync(path.join(ROOT, 'src'))) {
    if (!f.endsWith('.ts')) continue;
    assert.ok(!fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').includes('previewReleases'), f);
  }
});

test('the U3 and U4 defaults are settings; 0.5.3 removed testChoice, mc427TestMenu, plainCalls, and the update URL', () => {
  assert.equal(props['auraR.copilotTools'].default, 'auto');
  assert.equal(props['auraR.apaCheck'].default, true);
  assert.deepEqual(Object.keys(props).sort(), ['auraR.apaCheck', 'auraR.copilotTools', 'auraR.course', 'auraR.cranMirror', 'auraR.rPath', 'auraR.runWith']);
});

test('effectsize is required in all three courses', () => {
  for (const c of ['mc427', 'mc451', 'mc501'] as const) {
    const e = PROFILES[c].packages.find((p) => p.name === 'effectsize');
    assert.equal(e?.level, 'required', c);
  }
});

// ---------------- Check my test choice ----------------

test('the fitting tests follow the course rules', () => {
  assert.deepEqual(fittingTests('categorical', 'categorical-two-groups'), ['chi-square']);
  assert.deepEqual(fittingTests('categorical', 'categorical-three-plus-groups'), ['chi-square']);
  assert.deepEqual(fittingTests('numeric', 'categorical-two-groups'), ['t-test']);
  assert.deepEqual(fittingTests('numeric', 'categorical-three-plus-groups'), ['anova']);
  assert.deepEqual(fittingTests('numeric', 'numeric'), ['regression', 'correlation']);
  assert.deepEqual(fittingTests('categorical', 'numeric'), []);
});

test('a fitting choice is confirmed; a wrong one is flagged without naming the right test', () => {
  const ok = checkTestChoice('numeric', 'categorical-two-groups', 't-test');
  assert.equal(ok.fits, true);
  assert.match(ok.reason, /^A Welch t-test compares the mean/);
  const wrong = checkTestChoice('numeric', 'categorical-three-plus-groups', 't-test');
  assert.equal(wrong.fits, false);
  assert.match(wrong.reason, /^A t-test needs a number for the outcome and a category with exactly two groups./);
  // U4: the verdict on a wrong choice says what the chosen test needs, never which test to use
  for (const other of ['ANOVA', 'chi-square', 'regression', 'correlation']) assert.ok(!wrong.reason.includes(other), other);
});

test('every (outcome, comparison, test) gives a verdict', () => {
  const tests: TestId[] = ['chi-square', 't-test', 'anova', 'regression', 'correlation'];
  for (const o of ['categorical', 'numeric'] as const) {
    for (const c of ['categorical-two-groups', 'categorical-three-plus-groups', 'numeric'] as const) {
      for (const t of tests) {
        const v = checkTestChoice(o, c, t);
        assert.equal(v.fits, fittingTests(o, c).includes(t));
        assert.ok(v.reason.length > 20);
      }
    }
  }
});

// ---------------- APA numbers ----------------

test('every course has an APA numbers block for each test, in R4', () => {
  for (const c of ['mc427', 'mc451', 'mc501'] as const) {
    for (const t of APA_TESTS) {
      assert.ok(hasTask(c, apaTask(t)), `${c} ${t}`);
      assert.equal(TASK_RELEASE[apaTask(t)], 'R4');
    }
  }
});

test('APA blocks follow the house style and write no sentence words or interpretation', () => {
  for (const c of ['mc427', 'mc451', 'mc501'] as const) {
    for (const t of APA_TESTS) {
      const code = generate(c, apaTask(t));
      assert.ok(code.startsWith('# ---- APA numbers to check your sentence: '), `${c} ${t} banner`);
      assert.ok(!code.includes('|>'), 'never the base pipe');
      assert.ok(code.endsWith('\n') && !code.endsWith('\n\n'));
      assert.ok(!/ +\n/.test(code), 'no trailing spaces');
      assert.match(code, /Your sentence is yours to write/);
      // U4: no plain-English template text, no "significant" verdict words
      for (const banned of ['This analysis asked', 'significant', 'YOUR TURN', 'compared ', 'examined']) {
        assert.ok(!code.includes(banned), `${c} ${t}: ${banned}`);
      }
      // One verb per line after each pipe
      for (const line of code.split('\n')) assert.ok((line.match(/%>%/g) ?? []).length <= 1, line);
    }
  }
});

test('MC 427 rounds the Welch df; MC 451 and MC 501 keep one decimal', () => {
  assert.match(generate('mc427', 'apa-t-test'), /apa_num\(parameter, 0\)/);
  assert.match(generate('mc451', 'apa-t-test'), /apa_num\(parameter, 1\)/);
  assert.equal(generate('mc451', 'apa-t-test'), generate('mc501', 'apa-t-test'));
});

// ---------------- Copilot tools ----------------

test('auto turns the Copilot tools on for MC 451 and MC 501 and off for MC 427 (U3)', () => {
  assert.equal(copilotToolsOn('auto', 'mc427'), false);
  assert.equal(copilotToolsOn('auto', 'mc451'), true);
  assert.equal(copilotToolsOn('auto', 'mc501'), true);
  assert.equal(copilotToolsOn('auto', undefined), false);
  assert.equal(copilotToolsOn('on', 'mc427'), true);
  assert.equal(copilotToolsOn('off', 'mc451'), false);
});

test('the three tools are contributed, read-only by description, and gated by the context key', () => {
  const tools = pkg.contributes.languageModelTools as any[];
  assert.deepEqual(tools.map((t) => t.name), ['aura_r_check_setup', 'aura_r_explain_error', 'aura_r_check_test_choice']);
  assert.deepEqual(tools.map((t) => t.displayName), ['Check my R setup', 'Explain an R error', 'Check my test choice']);
  for (const t of tools) {
    assert.equal(t.when, 'auraR.copilotToolsOn');
    assert.ok(t.inputSchema && t.modelDescription && t.userDescription);
  }
  assert.match(pkg.engines.vscode, /\^1\.(9[5-9]|1\d\d)/, 'the tools API needs VS Code 1.95');
});

test('the error tool returns the course table entry, or says it is not in the table', () => {
  const hit = explainForModel("Error in library(v2v) : there is no package called 'v2v'", 'mc451');
  assert.match(hit, /What to do:\n1\. /);
  assert.match(explainForModel('Error: something nobody has seen', 'mc451'), /not in the course's table/);
  assert.match(explainForModel('  ', 'mc451'), /No message was given/);
});

test('the test tool checks the given choice and refuses to choose', () => {
  assert.match(testChoiceForModel({ outcome: 'numeric', comparison: 'categorical-two-groups', chosenTest: 't-test' }), /^Fits\./);
  assert.match(testChoiceForModel({ outcome: 'numeric', comparison: 'numeric', chosenTest: 'anova' }), /^Does not fit\./);
  assert.match(testChoiceForModel({ outcome: 'numeric', comparison: 'numeric' }), /do not choose it for them/);
});

// ---------------- fig-alt ----------------

test('a chart wrapped in a new Quarto chunk gets the fig-alt option first', () => {
  const code = generate('mc451', 'bar');
  const plan = prepareInsert(code, true, false, [FIG_ALT_OPTION]);
  assert.ok(plan.wrappedInChunk);
  assert.ok(plan.text.startsWith('\n```{r}\n#| fig-alt: "YOUR TURN'));
  assert.match(code, /alt = "YOUR TURN/);
  // Not in a .R file
  assert.equal(prepareInsert(code, false, true, [FIG_ALT_OPTION]).text, code);
});
