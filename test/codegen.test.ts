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
// Code parity (2026-10-28) adds 4: the coding sample for mc451, mc501, and mc427, plus the dplyr
// form on chat with no groups. It adds 3 more: the crosstab of two columns the student picks, for
// mc427 (plain tidyverse) and mc451, and the MC 427 agreement check of Module 4 DT03; and 2 for the
// settings block with the student's own variables, with a t-test run on them. 9 more run the
// Describe tasks on columns picked from the course data, and 32 run every column-taking task on a
// student's own file, whose column names and types differ from the course data (owner, 2026-10-28:
// nothing hard-coded to the sample).
test('the golden manifest has 155 entries, 149 generated', () => {
  assert.equal(manifest.entries.length, 155);
  assert.equal(generated.length, 149);
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

// Owner 2026-11-04: no v2v helper reaches a student. Every MC 451 and MC 501 block is plain
// tidyverse, base R, and effectsize; the package supplies only data loaders and the theme.
const V2V_HELPERS = /\b(clean_dates|join_chat_streams|sample_messages|write_coding_form|crosstab|flag_outliers|run_t_test|run_chi_square|run_anova|run_regression)\(/;
test('no MC 451 or MC 501 block writes a v2v helper', () => {
  for (const e of generated) {
    if (e.profile === 'mc427') continue;
    const got = generate(e.profile as GenProfile, e.task, e.params ?? {});
    assert.ok(!V2V_HELPERS.test(got), `${e.id} writes a v2v helper`);
  }
});

test('the MC 451 and MC 501 tests write t.test(), chisq.test(), aov(), and lm() with effectsize', () => {
  for (const course of ['mc451', 'mc501'] as const) {
    assert.ok(generate(course, 't-test').includes('t.test(outcome ~ group2, data = analysis)'));
    assert.ok(generate(course, 't-test').includes('cohens_d(outcome ~ group2, data = analysis)'));
    assert.ok(generate(course, 'chi-square').includes('chi <- chisq.test(counts)'));
    assert.ok(generate(course, 'anova').includes('fit_anova <- aov(outcome ~ group3, data = analysis)'));
    assert.ok(generate(course, 'regression').includes('fit_lm <- lm(outcome ~ predictor, data = analysis)'));
    assert.ok(generate(course, 'settings-block').includes('library(effectsize)'));
  }
  const grad = generate('mc501', 'chi-square');
  assert.ok(grad.includes('round(chi$expected, 1)') && grad.includes('round(chi$stdres, 2)'));
  assert.ok(!generate('mc451', 'chi-square').includes('chi$stdres'));
  assert.ok(generate('mc501', 'anova').includes('TukeyHSD(fit_anova)'));
  assert.ok(generate('mc501', 'regression').includes('standardize_parameters(fit_lm)'));
});

test('the wrangling steps are plain lubridate and dplyr', () => {
  for (const course of ['mc451', 'mc501'] as const) {
    assert.ok(generate(course, 'clean-dates').includes('  mutate(ts = as_datetime(date / 1000))'));
    const j = generate(course, 'join-chat-streams');
    assert.ok(j.includes('  select(channel, snapshot_ts = ts, game, viewers)'));
    assert.ok(j.includes('    by = join_by(channel, closest(ts >= snapshot_ts))'));
    const s = generate(course, 'sample');
    assert.ok(s.includes('set.seed(409)') && s.includes('  group_by(channel) %>%') && s.includes('  slice_sample(n = 30) %>%'));
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
    // Novice ceiling (owner 2026-11-03): the six-hour table comes ready-made from v2v 0.3.9, so the
    // block never builds it with floor_date() and fct_lump_n(), and never converts time by hand.
    assert.ok(code.includes('viewers_over_time <- twitch_viewers_over_time()'), 'prepared table');
    assert.ok(!code.includes('floor_date') && !code.includes('fct_lump_n') && !code.includes('as.POSIXct'), 'no hand-built table');
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
    // density * width is each band's share of its group (bars sum to 1), which is what the y label
    // says; density alone is share per character, a fifth of that at binwidth 5 (#mc451501-improve G-a)
    assert.ok(generate(course, 'histogram-grouped').includes('ggplot(aes(x = length_shown, y = after_stat(density * width), fill = is_gaming)) +'));
    for (const t of ['line', 'bar', 'histogram']) {
      assert.ok(generate(course, t).includes('  scale_y_continuous(labels = scales::label_comma()) +'), `${course} ${t}`);
    }
  }
  // MC 427 counts posts in the hundreds: its charts stay as they are
  for (const t of ['bar', 'histogram']) assert.ok(!generate('mc427', t).includes('label_comma'), t);
});
