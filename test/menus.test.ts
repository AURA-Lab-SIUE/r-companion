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
import { isInsideRChunk, wrapChunk, prepareInsert, isQuartoFile } from '../src/insert';
import { buildGridHtml, gridCsv, DEFAULT_GRID, GridResult } from '../src/grid';

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
