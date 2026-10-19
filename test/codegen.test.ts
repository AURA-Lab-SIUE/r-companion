// One byte-equality test per generated manifest entry (workstream E, #rgui).
//
// For every entry the golden manifest marks generated, generate() for its (profile, task) must
// reproduce the golden fixture file exactly, after normalizing line endings. The golden manifest
// and fixtures are vendored under golden/ (copied from
// O:\20-research\aura-lab\r-companion-golden\, workstream B; moved to v2v 0.3.3 for R2).

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import { generate, hasTask, GenParams, GenProfile, TASK_RELEASE } from '../src/codegen';

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
  /** Wizard choices for an alternative entry (the count of the saved analysis). */
  params?: GenParams;
  requires: string[];
}

const manifest = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'manifest.json'), 'utf8')) as {
  entries: Entry[];
};

const norm = (s: string) => s.replace(/\r\n/g, '\n');

const generated = manifest.entries.filter((e) => e.generated);

// 84 from workstream B, plus the four MC 451 and MC 501 plain-call test defaults (q-20261018-0044 = A),
// plus the two MC 451 and MC 501 counts of the saved analysis (R2 card step 7, 2026-10-19)
test('the golden manifest has 90 entries, 84 generated', () => {
  assert.equal(manifest.entries.length, 90);
  assert.equal(generated.length, 84);
});

for (const e of generated) {
  test(`${e.id} (${e.release}, ${e.role}) is byte-identical to ${e.file}`, () => {
    const golden = norm(fs.readFileSync(path.join(GOLDEN, e.file), 'utf8'));
    const got = norm(generate(e.profile as GenProfile, e.task, e.params ?? {}, e.options ?? {}));
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

// v2v 0.3.3 from R2 on (owner q-20261018-0047 = A): its join returns ts and snapshot_ts, and the
// rename(ts = ts.x, ...) line 0.3.2 needed errors on 0.3.3, so no block or preamble may write it.
test('no generated block or runner preamble renames ts.x', () => {
  for (const e of generated) {
    assert.ok(!generate(e.profile as GenProfile, e.task, e.params ?? {}, e.options ?? {}).includes('ts.x'), e.id);
    for (const r of e.requires) {
      assert.ok(!fs.readFileSync(path.join(GOLDEN, r), 'utf8').includes('ts.x'), r);
    }
  }
});

// Count runs in the order the menu lists it: Load the course Twitch corpus makes chat, and the
// default count reads chat. The saved analysis is an alternative the menu offers once it exists.
test('the MC 451 and MC 501 count reads chat by default, analysis on request', () => {
  for (const course of ['mc451', 'mc501'] as const) {
    assert.ok(generate(course, 'count').includes('chat %>%\n  count(channel, sort = TRUE)'));
    const a = generate(course, 'count', { data: 'analysis', column: 'channel_type' });
    assert.ok(a.includes('analysis %>%\n  count(channel_type, sort = TRUE)'));
  }
});

test('a filter on a TRUE or FALSE value writes it without quotation marks', () => {
  const f = generate('mc451', 'filter', { data: 'chat_streams', column: 'is_gaming', value: 'TRUE', rawValue: true });
  assert.ok(f.includes('  filter(is_gaming == TRUE)'));
  assert.ok(f.includes('# Keep the rows where is_gaming is TRUE and name the result gaming.'));
  assert.ok(generate('mc451', 'filter').includes('# Keep the messages from gaming channels'));
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
