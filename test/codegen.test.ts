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
// plus the two MC 451 and MC 501 counts of the saved analysis (R2 card step 7, 2026-10-19).
// Phase 2 charts (#rgui, 2026-10-19) add 5: mc451/mc501 line, mc451/mc501 grouped histogram, mc501 power.
// 0.5.1 adds 2 checks: the mc451/mc501 line chart run after the R2 clean_dates() step as well as fresh.
// 0.5.3 adds 6 (import-xlsx x3, join-tables x3) and removes 9 entries, 8 files (owner q-20261022-0006
// = A): the wrapper-only MC 451 and MC 501 t-test and chi-square, the three v2v-plain proposals, and
// the plain date alternative. The plain-call tests are the defaults now, under their own names.
test('the golden manifest has 94 entries, 88 generated', () => {
  assert.equal(manifest.entries.length, 94);
  assert.equal(generated.length, 88);
});

for (const e of generated) {
  test(`${e.id} (${e.release}, ${e.role}) is byte-identical to ${e.file}`, () => {
    const golden = norm(fs.readFileSync(path.join(GOLDEN, e.file), 'utf8'));
    const got = norm(generate(e.profile as GenProfile, e.task, e.params ?? {}));
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
    assert.ok(!generate(e.profile as GenProfile, e.task, e.params ?? {}).includes('ts.x'), e.id);
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

// Owner q-20261018-0044 = A: MC 451 and MC 501 write the irr and test calls the v2v wrappers stand
// for, with the wrapper last as a check. Since 0.5.3 there is no wrapper-only variant.
test('reliability writes the irr calls, with the wrapper as a check, codes numbered from the data', () => {
  for (const course of ['mc451', 'mc501'] as const) {
    const r = generate(course, 'reliability');
    assert.ok(r.includes('irr::kappa2()') && r.includes('method = "kappa"'));
    assert.ok(r.indexOf('irr::') < r.indexOf('reliability('), 'the wrapper comes last');
    assert.ok(!r.includes('"calm"'), 'never a fixed codebook');
  }
});

test('the MC 451 and MC 501 tests write t.test() and chisq.test(), the wrapper last', () => {
  for (const course of ['mc451', 'mc501'] as const) {
    const t = generate(course, 't-test');
    assert.ok(t.indexOf('t.test(outcome ~ group2') < t.indexOf('run_t_test('));
    const c = generate(course, 'chi-square');
    assert.ok(c.indexOf('  broom::tidy()') < c.indexOf('run_chi_square('));
  }
});

// Phase 2 charts (#rgui, 2026-10-19). The line chart and grouped histogram are MC 451 and MC 501
// only (the v2v profiles); MC 427 does not grade them, so they must not appear there.
test('the line chart is a v2v (MC 451/MC 501) task only, in house style', () => {
  for (const course of ['mc451', 'mc501'] as const) {
    const code = generate(course, 'line');
    assert.ok(code.includes('geom_line(linewidth = 0.9)'), 'draws a line');
    assert.ok(code.includes('v2v::scale_colour_v2v()') && code.includes('v2v::theme_v2v()'), 'house theme');
    assert.ok(code.includes('ggsave("figures/viewers-over-time-line.png"'), 'saves to figures/');
    assert.ok(code.includes('alt = "YOUR TURN'), 'the YOUR TURN alt line');
    // one verb per line after each pipe
    for (const line of code.split('\n')) assert.ok((line.match(/%>%/g) || []).length <= 1, line);
    // U7 = B: time comes from the clean_dates() helper as in decks s23 and w12, never as.POSIXct
    assert.ok(code.includes('    ts = clean_dates(date),') && code.includes('six_hour = floor_date(ts, "6 hours")'), 'clean_dates ts');
    assert.ok(!code.includes('as.POSIXct'), 'no hand as.POSIXct conversion');
  }
  assert.ok(!hasTask('mc427', 'line'), 'MC 427 does not offer the line chart');
});

test('the grouped histogram overlays two groups and is MC 451/MC 501 only', () => {
  for (const course of ['mc451', 'mc501'] as const) {
    const code = generate(course, 'histogram-grouped');
    assert.ok(code.includes('position = "identity"'), 'overlaid, not stacked');
    assert.ok(code.includes('fill = is_gaming'), 'fill by the group');
    assert.ok(code.includes('geom_histogram(binwidth = 5'), 'a histogram');
    assert.ok(code.includes('ggsave("figures/message-length-grouped-histogram.png"'), 'saves to figures/');
    assert.ok(code.includes('alt = "YOUR TURN'), 'the YOUR TURN alt line');
  }
  assert.ok(!hasTask('mc427', 'histogram-grouped'), 'MC 427 does not offer the grouped histogram');
});

test('the power analysis is MC 501 only and writes a plain, commented pwr.t.test() call', () => {
  const code = generate('mc501', 'power');
  assert.ok(code.includes('library(pwr)'), 'loads pwr');
  assert.ok(code.includes('pwr.t.test('), 'the plain pwr call');
  assert.ok(code.includes('d = 0.5,') && code.includes('sig.level = 0.05,') && code.includes('power = 0.80,') && code.includes('type = "two.sample"'), 'every argument');
  // a comment explaining each of the four arguments
  assert.equal((code.match(/# .+$/gm) || []).length >= 7, true);
  assert.ok(!hasTask('mc451', 'power'), 'MC 451 (undergraduate) does not offer power analysis');
  assert.ok(!hasTask('mc427', 'power'), 'MC 427 does not offer power analysis');
  assert.throws(() => generate('mc451', 'power'), 'MC 451 has no power template');
});

// Wizard overrides still produce well-formed, parameterized code.
test('wizard overrides flow into the generated code', () => {
  const code = generate('mc427', 'filter', { data: 'tweets', column: 'platform', value: 'X', result: 'x_posts' });
  assert.ok(code.includes('x_posts <- tweets %>%'));
  assert.ok(code.includes('filter(platform == "X")'));
  assert.ok(code.includes('nrow(x_posts)'));
});

// 0.5.3 chart quality (#rgui Rank 1): every Load block turns off scientific notation, the grouped
// histogram draws each group as shares, and the Twitch count axes print with commas.
test('0.5.3: every Load block sets options(scipen = 10) right after the library() lines', () => {
  const loads: [GenProfile, string][] = [
    ['mc427', 'import-csv'],
    ['mc451', 'import-csv'], ['mc451', 'import-course-dataset'], ['mc451', 'import-rds'],
    ['mc501', 'import-csv'], ['mc501', 'import-course-dataset'], ['mc501', 'import-rds'],
  ];
  for (const [p, t] of loads) {
    const code = generate(p, t);
    const lib = code.lastIndexOf('library(');
    const sci = code.indexOf('options(scipen = 10)');
    assert.ok(sci > lib && lib >= 0, `${p} ${t}`);
  }
  // A block that loads no data does not change the session's printing
  assert.ok(!generate('mc451', 'count').includes('scipen'));
});

test('0.5.3: the grouped histogram shows shares, and the Twitch count axes use commas', () => {
  for (const course of ['mc451', 'mc501'] as const) {
    assert.ok(generate(course, 'histogram-grouped').includes('ggplot(aes(x = length_shown, y = after_stat(density), fill = is_gaming)) +'));
    for (const t of ['line', 'bar', 'histogram']) {
      assert.ok(generate(course, t).includes('  scale_y_continuous(labels = scales::label_comma()) +'), `${course} ${t}`);
    }
  }
  // MC 427 counts posts in the hundreds: its charts stay as they are
  for (const t of ['bar', 'histogram']) assert.ok(!generate('mc427', t).includes('label_comma'), t);
});
