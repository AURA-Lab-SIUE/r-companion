// Import a data file (0.5.3, #rgui Rank 2): the pure helpers behind the Data menu's import.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import {
  dataFileKind,
  tableNameFromFile,
  tableNameProblem,
  scriptPath,
  probeExpr,
  sheetListExpr,
  peekSummary,
  namesNeedCleaning,
} from '../src/importFile';
import { generate } from '../src/codegen';
import { ColumnProbe, fillProbe } from '../src/columnProbe';
import * as fs from 'fs';

test('the file kind comes from the extension, in any case', () => {
  assert.equal(dataFileKind('data/a.csv'), 'csv');
  assert.equal(dataFileKind('C:\\x\\Coded.XLSX'), 'excel');
  assert.equal(dataFileKind('old.xls'), 'excel');
  assert.equal(dataFileKind('saved.RDS'), 'rds');
  assert.equal(dataFileKind('notes.txt'), undefined);
});

test('the default table name is made from the file name and is a valid R name', () => {
  assert.equal(tableNameFromFile('data/reliability-pilot.csv'), 'reliability_pilot');
  assert.equal(tableNameFromFile('C:\\Users\\s\\Coded Pilot (v2).xlsx'), 'coded_pilot_v2');
  assert.equal(tableNameFromFile('2024 codes.xlsx'), 'data_2024_codes');
  assert.equal(tableNameFromFile('---.csv'), 'data');
  for (const f of ['data/reliability-pilot.csv', '2024 codes.xlsx', 'Ünïcode file.csv']) {
    assert.equal(tableNameProblem(tableNameFromFile(f)), undefined, f);
  }
});

test('a typed table name is checked in plain words', () => {
  assert.equal(tableNameProblem('coded_pilot'), undefined);
  assert.match(tableNameProblem('')!, /Type a name/);
  assert.match(tableNameProblem('2pilot')!, /Start the name with a letter/);
  assert.match(tableNameProblem('coded pilot')!, /no spaces/);
  assert.match(tableNameProblem('if')!, /keeps for itself/);
});

test('a file inside the course folder is written relative with forward slashes; outside, absolute', () => {
  const folder = path.resolve('/course');
  const inside = scriptPath(path.join(folder, 'data', 'coded-pilot.xlsx'), folder);
  assert.deepEqual(inside, { path: 'data/coded-pilot.xlsx', outside: false });
  const outside = scriptPath(path.resolve('/elsewhere/pilot.csv'), folder);
  assert.equal(outside.outside, true);
  assert.ok(!outside.path.includes('\\'), 'forward slashes only');
  assert.ok(outside.path.endsWith('/elsewhere/pilot.csv'));
  // No folder open: always the absolute path
  assert.equal(scriptPath(path.resolve('/x/a.csv')).outside, true);
});

test('the probe reads CSV with readr, Excel with readxl and the chosen sheet, RDS with readRDS', () => {
  assert.equal(probeExpr('C:\\d\\a.csv'), 'readr::read_csv("C:/d/a.csv", show_col_types = FALSE)');
  assert.equal(probeExpr('C:\\d\\a.xlsx', 'Coder notes'), 'readxl::read_excel("C:/d/a.xlsx", sheet = "Coder notes")');
  assert.equal(probeExpr('a.xlsx'), 'readxl::read_excel("a.xlsx")');
  assert.equal(probeExpr('a.RDS'), 'readRDS("a.RDS")');
  assert.equal(sheetListExpr('C:\\d\\a.xlsx', 'C:\\t\\o.json'), 'jsonlite::write_json(readxl::excel_sheets("C:/d/a.xlsx"), "C:/t/o.json")');
});

const probe: ColumnProbe = {
  rows: 1350,
  columns: [
    { name: 'channel', class: 'character', type: 'chr', n_missing: 0, n_distinct: 50, values: null },
    { name: 'Pass 1', class: 'character', type: 'chr', n_missing: 0, n_distinct: 2, values: ['calm', 'high-energy'] },
    { name: 'pass_2', class: 'character', type: 'chr', n_missing: 3, n_distinct: 2, values: ['calm', 'high-energy'] },
    { name: 'Score', class: 'numeric', type: 'dbl', n_missing: 0, n_distinct: 9, values: null },
  ],
};

test('the peek reads as a sentence with comma thousands and plain type words', () => {
  assert.equal(peekSummary(probe), '4 columns, 1,350 rows: channel (text), Pass 1 (text), pass_2 (text), Score (number)');
  assert.equal(peekSummary(probe, 2), '4 columns, 1,350 rows: channel (text), Pass 1 (text), ...');
});

test('names with spaces or capitals are the ones clean_names() would change', () => {
  assert.deepEqual(namesNeedCleaning(probe), ['Pass 1', 'Score']);
});

test('the Excel import block: readxl named in full, the sheet, scipen, glimpse; MC 427 without v2v', () => {
  const v = generate('mc451', 'import-xlsx', { data: 'coded_pilot', file: 'data/coded-pilot.xlsx', sheet: 'Coder notes' });
  assert.ok(v.includes('library(v2v)'));
  assert.ok(v.includes('options(scipen = 10)'));
  assert.ok(v.includes('coded_pilot <- readxl::read_excel("data/coded-pilot.xlsx", sheet = "Coder notes")'));
  assert.ok(v.includes('glimpse(coded_pilot)'));
  const m = generate('mc427', 'import-xlsx', { data: 'posts', file: 'coded-posts.xlsx', sheet: 'Sheet1' });
  assert.ok(!m.includes('v2v'));
  assert.ok(m.includes('posts <- readxl::read_excel("coded-posts.xlsx", sheet = "Sheet1")'));
});

test('clean_names() is added, stacked on its own line, only when asked', () => {
  const csv = generate('mc501', 'import-csv', { data: 'pilot', file: 'data/p.csv', cleanNames: true });
  assert.ok(csv.includes('pilot <- read_csv("data/p.csv") %>%\n  janitor::clean_names()\n'));
  const xl = generate('mc501', 'import-xlsx', { data: 'pilot', file: 'data/p.xlsx', sheet: 'S', cleanNames: true });
  assert.ok(xl.includes('pilot <- readxl::read_excel("data/p.xlsx", sheet = "S") %>%\n  janitor::clean_names()\n'));
  assert.ok(!generate('mc501', 'import-csv', { file: 'data/p.csv' }).includes('clean_names'));
});

test('the column probe template is filled everywhere, including its code line', () => {
  const tpl = fs.readFileSync(path.join(__dirname, '..', '..', 'resources', 'column-probe.R'), 'utf8');
  // The 0.5.2 way replaced only the first token, the one in the header comment
  const old = tpl.replace('__DATA__', 'readxl::read_excel("a.xlsx")').replace('__OUT__', 'C:/t/o.json');
  assert.ok(old.includes('local({ x <- __DATA__'), 'the old fill left the code line unfilled');
  const filled = fillProbe(tpl, 'readxl::read_excel("a.xlsx")', 'C:\\t\\o.json');
  assert.ok(!filled.includes('__DATA__') && !filled.includes('__OUT__'));
  assert.ok(filled.includes('local({ x <- readxl::read_excel("a.xlsx");'));
  assert.ok(filled.includes('"C:/t/o.json"'));
});
