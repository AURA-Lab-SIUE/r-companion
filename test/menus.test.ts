// Tests for the pure code-generation helpers that back the menus (workstream E, #rgui):
// the column-probe reader, the .R / .qmd insert logic, and the reliability grid.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  parseColumnProbe,
  numericColumns,
  categoryColumns,
  twoLevelColumns,
  emptyCodedColumns,
  pickerHint,
} from '../src/columnProbe';
import { isInsideRChunk, wrapChunk, prepareInsert, isQuartoFile, savedChartPath, isCompletePng } from '../src/insert';
import { generate } from '../src/codegen';
import { buildGridHtml, gridCsv, DEFAULT_GRID, GridResult } from '../src/grid';
import { assignedNames, tableChoices, MAKES } from '../src/tables';

// A probe like the one probe/column-probe.R writes (shape from PACKAGE-COMPAT.md).
const PROBE_JSON = JSON.stringify({
  probe: 1,
  rows: 750,
  columns: [
    { name: 'word_count', class: 'numeric', type: 'dbl', n_missing: 0, n_distinct: 40, values: null },
    { name: 'like_count', class: 'numeric', type: 'dbl', n_missing: 0, n_distinct: 120, values: null },
    { name: 'posted_from', class: 'character', type: 'chr', n_missing: 0, n_distinct: 5, values: ['console', 'other apps', 'phone', 'tablet', 'web'] },
    { name: 'share_button', class: 'character', type: 'chr', n_missing: 0, n_distinct: 2, values: ['no', 'yes'] },
    { name: 'voted_up', class: 'logical', type: 'lgl', n_missing: 0, n_distinct: 2, values: ['FALSE', 'TRUE'] },
    { name: 'code_tone', class: 'logical', type: 'lgl', n_missing: 750, n_distinct: 0, values: null },
  ],
});

test('parseColumnProbe reads the probe JSON', () => {
  const p = parseColumnProbe(PROBE_JSON);
  assert.equal(p.rows, 750);
  assert.equal(p.columns.length, 6);
});

test('parseColumnProbe rejects anything that is not a probe', () => {
  assert.throws(() => parseColumnProbe('{"rows":10}'));
  assert.throws(() => parseColumnProbe('Rows: 750\nColumns: 36')); // console text, never accepted
});

test('column helpers classify by type', () => {
  const p = parseColumnProbe(PROBE_JSON);
  assert.deepEqual(numericColumns(p).map((c) => c.name), ['word_count', 'like_count']);
  assert.deepEqual(categoryColumns(p).map((c) => c.name), ['posted_from', 'share_button', 'voted_up', 'code_tone']);
  assert.deepEqual(twoLevelColumns(p).map((c) => c.name), ['share_button', 'voted_up']);
  assert.deepEqual(emptyCodedColumns(p).map((c) => c.name), ['code_tone']);
});

test('pickerHint flags empty coded and missing columns', () => {
  const p = parseColumnProbe(PROBE_JSON);
  const byName = (n: string) => p.columns.find((c) => c.name === n)!;
  assert.equal(pickerHint(byName('code_tone'), p.rows), 'empty: fill it first');
  assert.equal(pickerHint(byName('word_count'), p.rows), undefined);
});

test('isInsideRChunk tracks the nearest fence', () => {
  assert.equal(isInsideRChunk(['# notes', '```{r}', 'df <- 1']), true);
  assert.equal(isInsideRChunk(['```{r}', 'x <- 1', '```', 'prose']), false);
  assert.equal(isInsideRChunk(['just prose']), false);
  assert.equal(isInsideRChunk(['```{r setup, include=FALSE}', 'library(x)']), true);
});

test('prepareInsert wraps a chunk only in Quarto outside a chunk', () => {
  const code = 'df %>%\n  glimpse()\n';
  assert.equal(prepareInsert(code, false, true).wrappedInChunk, false); // .R
  assert.equal(prepareInsert(code, true, true).wrappedInChunk, false); // inside a chunk
  const wrapped = prepareInsert(code, true, false); // Quarto, not in a chunk
  assert.equal(wrapped.wrappedInChunk, true);
  assert.ok(wrapped.text.includes('```{r}'));
  assert.ok(wrapped.text.trimEnd().endsWith('```'));
});

// The chart-window fix (#rgui Phase 2): after a chart runs, the extension opens the PNG it saved.
// savedChartPath reads that path from the generated block's ggsave() call.
test('savedChartPath reads the ggsave path from every chart the menus generate', () => {
  assert.equal(savedChartPath(generate('mc451', 'line')), 'figures/viewers-over-time-line.png');
  assert.equal(savedChartPath(generate('mc501', 'histogram-grouped')), 'figures/message-length-grouped-histogram.png');
  assert.equal(savedChartPath(generate('mc451', 'bar')), 'figures/top-games-bar.png');
  assert.equal(savedChartPath(generate('mc451', 'histogram')), 'figures/message-length-histogram.png');
  assert.equal(savedChartPath(generate('mc451', 'boxplot')), 'figures/message-length-boxplot.png');
  assert.equal(savedChartPath(generate('mc427', 'bar')), 'posted-from-bar.png');
  // a non-chart block saves nothing, so there is no file to open
  assert.equal(savedChartPath(generate('mc451', 'frequency')), undefined);
});

test('isQuartoFile matches qmd and rmd', () => {
  assert.ok(isQuartoFile('analysis.qmd'));
  assert.ok(isQuartoFile('report.Rmd'));
  assert.ok(!isQuartoFile('script.R'));
});

test('gridCsv writes pass_1/pass_2 with the recorded dates, only fully coded rows', () => {
  const result: GridResult = {
    rows: [
      { pass_1: 'calm', pass_2: 'calm' },
      { pass_1: 'high-energy', pass_2: '' }, // not coded twice: dropped
      { pass_1: 'high-energy', pass_2: 'calm' },
    ],
    method: 'kappa',
    pass_1_date: '2026-10-20',
    pass_2_date: '2026-10-21',
  };
  const csv = gridCsv(result);
  assert.equal(csv.split('\n')[0], 'pass_1,pass_2,pass_1_date,pass_2_date');
  const body = csv.trimEnd().split('\n').slice(1);
  assert.equal(body.length, 2); // the half-coded row is dropped
  assert.equal(body[0], 'calm,calm,2026-10-20,2026-10-21');
});

test('the grid webview uses theme variables, labels every field, and is keyboard operable', () => {
  const html = buildGridHtml(DEFAULT_GRID, { cspSource: 'vscode-resource:', nonce: 'abc' });
  assert.ok(html.includes('var(--vscode-editor-background)'));
  assert.ok(html.includes('var(--vscode-focusBorder)')); // visible focus
  assert.ok(html.includes(':focus-visible'));
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(html.includes("nonce-abc"));
  // Every select has a label (native controls are Tab-navigable; no color-only state).
  const selects = (html.match(/<select/g) || []).length;
  const labels = (html.match(/<label/g) || []).length;
  assert.ok(labels >= selects, `expected a label per field: ${labels} labels, ${selects} selects`);
  assert.ok(html.includes('aria-live')); // status announced to screen readers
});

test('the standalone grid copy (for axe) fills theme variables and drops the live CSP', () => {
  const html = buildGridHtml(DEFAULT_GRID, { standalone: true });
  assert.ok(html.includes('--vscode-editor-background: #ffffff'));
  assert.ok(!html.includes('Content-Security-Policy'));
});

// The Data menu's table choice (tables.ts): R2 card step 7, 2026-10-19, wrote a count of analysis
// right after Load the course Twitch corpus, and R stopped with "object 'analysis' not found".

test('assignedNames reads the tables a script assigns, not the ones it only uses', () => {
  const script = [
    'chat <- twitch_chat()',
    '  streams <- twitch_streams()',
    'chat %>%',
    '  count(channel)',
    '# analysis <- read_rds("data/twitch_analysis.RDS")',
    'x = 1',
  ].join('\n');
  assert.deepEqual([...assignedNames(script)].sort(), ['chat', 'streams']);
});

test('count offers only chat until analysis exists, then chat first and analysis after it', () => {
  assert.deepEqual(tableChoices('count', new Set(['chat', 'streams'])).map((c) => c.name), ['chat']);
  const both = tableChoices('count', new Set(['chat', 'analysis']));
  assert.deepEqual(both.map((c) => c.name), ['chat', 'analysis']);
  assert.equal(both[0].defaultColumn, 'channel');
  assert.equal(both[1].defaultColumn, 'channel_type');
  assert.ok(both[0].templateDefault && !both[1].templateDefault);
});

test('filter and select keep the course default analysis once it exists, and never offer it before', () => {
  for (const task of ['filter', 'select']) {
    const before = tableChoices(task, new Set(['chat']));
    assert.deepEqual(before.map((c) => c.name), ['chat']);
    assert.ok(!before[0].templateDefault && before[0].defaultColumn === undefined, 'chat has no course default here');
    const after = tableChoices(task, new Set(['chat', 'analysis', 'chat_streams']), 'C:/w/data/twitch_analysis.RDS');
    assert.deepEqual(after.map((c) => c.name), ['analysis', 'chat', 'chat_streams']);
    assert.ok(after[0].templateDefault);
    assert.equal(after[0].probe, 'readRDS("C:/w/data/twitch_analysis.RDS")');
  }
});

test('the menu blocks that make tables are the ones the choice looks for', () => {
  assert.deepEqual(MAKES['import-course-dataset'], ['chat', 'streams']);
  assert.deepEqual(MAKES['import-rds'], ['analysis']);
});

// 0.5.1: the chart tab opens when the PNG is completely written, not at a fixed time. R's png device
// creates the file first and fills it when the device closes, so an empty or partial file must wait.
test('isCompletePng accepts a whole PNG and refuses an empty, partial, or non-PNG file', () => {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.from('0000000d49484452000000010000000108060000001f15c489', 'hex');
  const iend = Buffer.from('0000000049454e44ae426082', 'hex');
  assert.equal(isCompletePng(Buffer.concat([sig, ihdr, iend])), true);
  assert.equal(isCompletePng(Buffer.alloc(0)), false, 'just created by the device');
  assert.equal(isCompletePng(Buffer.concat([sig, ihdr])), false, 'IEND not written yet');
  assert.equal(isCompletePng(Buffer.concat([Buffer.from('GIF89a..'), ihdr, iend])), false, 'not a PNG');
});
