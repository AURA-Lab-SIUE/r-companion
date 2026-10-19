// One byte-equality test per generated manifest entry (workstream E, #rgui).
//
// For every entry the golden manifest marks generated, generate() for its (profile, task) must
// reproduce the golden fixture file exactly, after normalizing line endings. The golden manifest
// and fixtures are vendored under golden/ (copied from
// O:\20-research\aura-lab\r-companion-golden\, workstream B, v2v 0.3.2).

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import { generate, hasTask, GenProfile, TASK_RELEASE } from '../src/codegen';

const GOLDEN = path.join(__dirname, '..', '..', 'golden');

interface Entry {
  id: string;
  release: string;
  task: string;
  profile: string;
  generated: boolean;
  role: string;
  alternative_to: string | null;
  file: string;
  /** Generator options for this entry (the plain-call defaults set plainCalls). */
  options?: { plainCalls?: boolean };
}

const manifest = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'manifest.json'), 'utf8')) as {
  entries: Entry[];
};

const norm = (s: string) => s.replace(/\r\n/g, '\n');

const generated = manifest.entries.filter((e) => e.generated);

// 84 from workstream B, plus the four MC 451 and MC 501 plain-call test defaults (q-20261018-0044 = A)
test('the golden manifest has 88 entries, 82 generated', () => {
  assert.equal(manifest.entries.length, 88);
  assert.equal(generated.length, 82);
});

for (const e of generated) {
  test(`${e.id} (${e.release}, ${e.role}) is byte-identical to ${e.file}`, () => {
    const golden = norm(fs.readFileSync(path.join(GOLDEN, e.file), 'utf8'));
    // Default v2v version 0.3.2, matching the golden manifest.
    const got = norm(generate(e.profile as GenProfile, e.task, {}, e.options ?? {}));
    assert.equal(got, golden);
  });
}

test('every generated task maps to a known release', () => {
  for (const e of generated) {
    assert.ok(TASK_RELEASE[e.task], `task ${e.task} has no release`);
  }
});

test('hasTask agrees with the manifest for each generated entry', () => {
  for (const e of generated) {
    assert.ok(hasTask(e.profile as GenProfile, e.task), `${e.profile} should have ${e.task}`);
  }
});

// The 0.3.3 switch: the only generated file that differs on v2v 0.3.3 is the v2v join, which
// drops the rename() line (PACKAGE-CHANGES.md). Everything else is identical on both versions.
test('v2v 0.3.3 drops only the join rename line', () => {
  const join032 = generate('mc451', 'join-chat-streams', {}, { v2vVersion: '0.3.2' });
  const join033 = generate('mc451', 'join-chat-streams', {}, { v2vVersion: '0.3.3' });
  assert.ok(join032.includes('rename(ts = ts.x, snapshot_ts = ts.y)'));
  assert.ok(!join033.includes('rename(ts = ts.x, snapshot_ts = ts.y)'));
  assert.equal(join032.replace(' %>%\n  rename(ts = ts.x, snapshot_ts = ts.y)', ''), join033);

  for (const e of generated) {
    if (e.task === 'join-chat-streams') continue;
    const a = generate(e.profile as GenProfile, e.task, {}, { ...e.options, v2vVersion: '0.3.2' });
    const b = generate(e.profile as GenProfile, e.task, {}, { ...e.options, v2vVersion: '0.3.3' });
    assert.equal(a, b, `${e.id} should not change between v2v versions`);
  }
});

// plainCalls (owner q-20261018-0044 = A, the extension default): MC 451 and MC 501 reliability
// writes the irr calls of the v2v-plain fixture, with the wrapper last as a check; off, the wrapper.
test('plainCalls on reliability writes the irr calls, with the wrapper as a check', () => {
  const proposal = norm(fs.readFileSync(path.join(GOLDEN, 'fixtures/v2v-plain/r2-reliability.R'), 'utf8'));
  for (const course of ['mc451', 'mc501'] as const) {
    const plain = generate(course, 'reliability', {}, { plainCalls: true });
    assert.equal(norm(plain), proposal);
    assert.ok(plain.includes('irr::kappa2()') && plain.includes('method = "kappa"'));
    assert.ok(!generate(course, 'reliability').includes('irr::'));
  }
  // The codes are numbered from the data, never from a fixed codebook
  assert.ok(!proposal.includes('"calm"'));
});

test('plainCalls on the MC 451 and MC 501 tests writes t.test() and chisq.test(), the wrapper last', () => {
  for (const course of ['mc451', 'mc501'] as const) {
    const t = generate(course, 't-test', {}, { plainCalls: true });
    assert.ok(t.indexOf('t.test(outcome ~ group2') < t.indexOf('run_t_test('));
    const c = generate(course, 'chi-square', {}, { plainCalls: true });
    assert.ok(c.indexOf('  broom::tidy()') < c.indexOf('run_chi_square('));
  }
  // MC 427 has no wrappers, so the option changes nothing there
  assert.equal(generate('mc427', 't-test', {}, { plainCalls: true }), generate('mc427', 't-test'));
});

// Wizard overrides still produce well-formed, parameterized code.
test('wizard overrides flow into the generated code', () => {
  const code = generate('mc427', 'filter', { data: 'tweets', column: 'platform', value: 'X', result: 'x_posts' });
  assert.ok(code.includes('x_posts <- tweets %>%'));
  assert.ok(code.includes('filter(platform == "X")'));
  assert.ok(code.includes('nrow(x_posts)'));
});
