// 0.7.5 (Batch A, #rgui): save and load tables (A2, G11), Restart R and run my steps (A4), and the
// Run it note (G16). The term-safety rule: add only, so every 0.7.4 item keeps its place.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { menuTasks, menuItems, CATALOG } from '../src/catalog';
import { panelTree, PanelNode } from '../src/panelModel';
import { generate } from '../src/codegen';
import { saveChoices, rdsFileFor, plainName, tablesNotMade, COURSE_TABLES, SAVE_PICK_TASKS } from '../src/tables';

// Write R code in 0.7.4 (GitHub main 5e181bf), in menu order, for each course
const MENU_074: Record<'mc427' | 'mc451' | 'mc501', string[]> = {
  mc427: ['import-csv', 'list-files', 'filter', 'select', 'mutate', 'count', 'join-tables', 'pull-value', 'label-codes', 'export-csv', 'export-rds', 'sample', 'count-missing', 'count-distinct', 'five-numbers', 'frequency', 'crosstab', 'agreement', 'grouped-summary', 'bar', 'histogram', 'boxplot', 't-test', 't-test-missing', 'chi-square', 'anova', 'regression', 'correlation', 'check-test-choice', 'apa-check'],
  mc451: ['import-csv', 'import-course-dataset', 'import-rds', 'list-files', 'filter', 'select', 'mutate', 'count', 'clean-dates', 'join-chat-streams', 'channel-lookup', 'join-lookup', 'join-tables', 'label-from-snapshot', 'pull-value', 'label-codes', 'export-csv', 'export-rds', 'sample', 'reliability', 'count-missing', 'count-distinct', 'five-numbers', 'frequency', 'crosstab', 'grouped-summary', 'bar', 'histogram', 'histogram-grouped', 'line', 'boxplot', 'settings-block', 't-test', 'chi-square', 'anova', 'regression', 'correlation', 'check-test-choice', 'apa-check'],
  mc501: ['import-csv', 'import-course-dataset', 'import-rds', 'list-files', 'filter', 'select', 'mutate', 'count', 'clean-dates', 'join-chat-streams', 'channel-lookup', 'join-lookup', 'join-tables', 'label-from-snapshot', 'pull-value', 'label-codes', 'export-csv', 'export-rds', 'sample', 'reliability', 'count-missing', 'count-distinct', 'five-numbers', 'frequency', 'crosstab', 'grouped-summary', 'bar', 'histogram', 'histogram-grouped', 'line', 'boxplot', 'settings-block', 't-test', 'chi-square', 'anova', 'regression', 'correlation', 'power', 'check-test-choice', 'apa-check'],
};
const ADDED = ['save-rdata', 'load-rdata'];

const flat = (nodes: PanelNode[]): PanelNode[] => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);
const tree = (course: 'mc427' | 'mc451' | 'mc501', banners = [{ line: 4, label: 'Load the data' }]) =>
  panelTree({ course, items: menuItems(course, true), crossCheck: course === 'mc427', banners });

test('term safety: every 0.7.4 Write R code item keeps its place; the two new items come last, in MC 451 and MC 501 only', () => {
  for (const c of ['mc451', 'mc501'] as const) {
    assert.deepEqual(menuTasks(c, true), [...MENU_074[c], ...ADDED], c);
  }
  assert.deepEqual(menuTasks('mc427', true), MENU_074.mc427);
  // and no 0.7.4 label changed
  for (const t of ['export-rds', 'import-rds']) assert.ok(CATALOG.find((d) => d.task === t), t);
  assert.equal(CATALOG.find((d) => d.task === 'export-rds')!.label, 'Save a table as an RDS file');
  assert.equal(CATALOG.find((d) => d.task === 'import-rds')!.label, 'Load your saved analysis (RDS)');
});

test('term safety: in the panel, the new Data items follow every node the videos show', () => {
  for (const c of ['mc451', 'mc501'] as const) {
    const ids = tree(c).find((r) => r.id === 'data')!.children!.map((n) => n.id);
    const fix = ids.indexOf('data/not-attached');
    assert.deepEqual(ids.slice(fix + 1), ['data/save-rdata', 'data/load-rdata'], c);
    assert.deepEqual(ids.slice(0, fix + 1).filter((i) => !['data/viewer', 'data/objects', 'data/not-attached'].includes(i)), MENU_074[c].filter((t) => menuItems(c, true).find((i) => i.task === t)!.category === 'R2 Data').map((t) => `data/${t}`));
  }
  assert.ok(!flat(tree('mc427')).some((n) => ADDED.some((a) => n.id.endsWith(a))));
});

test('A4: Restart R and run my steps sits after the fixed Your steps nodes and before the script sections', () => {
  for (const c of ['mc427', 'mc451', 'mc501'] as const) {
    const kids = tree(c).find((r) => r.id === 'steps')!.children!;
    const ids = kids.map((n) => n.id);
    const at = ids.indexOf('steps/restart-run');
    assert.ok(at > 0, c);
    assert.ok(ids.slice(0, at).every((i) => !i.startsWith('steps/banner/')), c);
    assert.ok(ids.slice(at + 1).every((i) => i.startsWith('steps/banner/')), c);
    assert.equal(ids[0], 'steps/open');
    assert.equal(ids[1], 'steps/run');
    const node = kids[at];
    assert.equal(node.label, 'Restart R and run my steps');
    assert.equal(node.command?.command, 'auraR.restartAndRunSteps');
    // The confirm is skipped only for the integration suite's token: the panel row passes nothing
    assert.equal(node.command?.args, undefined, c);
  }
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'menus.ts'), 'utf8');
  assert.match(src, /runSteps\(context, deps, true, arg === RESTART_CONFIRMED\)/);
  assert.match(src, /if \(restart && !confirmed\) \{\n\s+const ok = await vscode\.window\.showWarningMessage\(RESTART_ASK, \{ modal: true \}/);
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  assert.ok(pkg.contributes.commands.some((c: any) => c.command === 'auraR.restartAndRunSteps' && c.title === 'Restart R and run my steps'));
});

test('A4: the restart closes every R terminal and clears what the menus think R has, before the steps run', () => {
  const ext = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');
  const fn = ext.slice(ext.indexOf('async function restartR('), ext.indexOf('async function runInSession('));
  assert.match(fn, /isRTerminalName\(t\.name\)/);
  assert.match(fn, /t\.dispose\(\)/);
  assert.match(fn, /onDidCloseTerminal/);
  const menus = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'menus.ts'), 'utf8');
  const run = menus.slice(menus.indexOf('async function runSteps('), menus.indexOf('async function goToLine('));
  assert.ok(run.indexOf('deps.restartR()') < run.indexOf('ranTables.clear()'));
  assert.ok(run.indexOf('ranTables.clear()') < run.indexOf('deps.runInSession(code)'));
  assert.match(run, /modal: true/);
});

test('A2: Save a table as an RDS file uses the table picker in MC 451 and MC 501, with the course table first', () => {
  assert.ok(SAVE_PICK_TASKS.has('export-rds'));
  const menus = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'menus.ts'), 'utf8');
  assert.match(menus, /course !== 'mc427' && def\.task === 'export-rds'\) return saveRdsFlow\(/);
  const flow = menus.slice(menus.indexOf('async function saveRdsFlow('), menus.indexOf('async function loadRdsFlow('));
  assert.match(flow, /saveChoices\(tablesSoFar\(\), 'analysis'\)/);
  assert.match(flow, /showQuickPick/);
  // one table (the course one): no pick, the 0.7.4 flow
  assert.match(flow, /if \(choices\.length > 1\)/);
  assert.deepEqual(saveChoices(['chat', 'analysis', 'chat_counts'], 'analysis'), ['analysis', 'chat', 'chat_counts']);
  assert.deepEqual(saveChoices([], 'analysis'), ['analysis']);
  assert.equal(rdsFileFor('analysis', 'analysis', 'data/twitch_analysis.RDS'), 'data/twitch_analysis.RDS');
  assert.equal(rdsFileFor('chat_counts', 'analysis', 'data/twitch_analysis.RDS'), 'data/chat_counts.RDS');
  // the course table with the course file writes the golden block, byte for byte
  assert.equal(generate('mc451', 'export-rds', {}), generate('mc451', 'export-rds', { data: 'analysis', file: 'data/twitch_analysis.RDS' }));
  assert.match(generate('mc451', 'export-rds', { data: 'chat_counts', file: 'data/chat_counts.RDS' }), /write_rds\(chat_counts, "data\/chat_counts\.RDS"\)/);
});

test('A2: Save several tables writes save() with the tables picked, never save.image(), and checks without changing a table', () => {
  const code = generate('mc451', 'save-rdata', { tables: ['analysis', 'chat_counts'], file: 'data/my-work.RData' });
  assert.match(code, /^save\(analysis, chat_counts, file = "data\/my-work\.RData"\)$/m);
  assert.match(code, /^load\("data\/my-work\.RData", envir = new\.env\(\), verbose = TRUE\)$/m);
  assert.doesNotMatch(code, /save\.image/);
  assert.equal(generate('mc501', 'save-rdata', {}), generate('mc451', 'save-rdata', {}));
  const load = generate('mc451', 'load-rdata', { file: 'data/my-work.RData' });
  assert.match(load, /^load\("data\/my-work\.RData", verbose = TRUE\)$/m);
  assert.match(load, /^library\(tidyverse\)$/m);
  assert.ok(!plainName('my table') && !plainName('TRUE') && plainName('chat_counts') && plainName('coded.v2'));
});

test('G11: Load your saved analysis asks for the file only when data/ holds another RDS file, and keeps the name analysis', () => {
  const menus = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'menus.ts'), 'utf8');
  const flow = menus.slice(menus.indexOf('async function loadRdsFlow('), menus.indexOf('async function saveRdataFlow('));
  assert.match(flow, /if \(others\.length > 0\)/);
  assert.match(flow, /It is loaded as analysis/);
  assert.equal(generate('mc451', 'import-rds', {}), generate('mc451', 'import-rds', { file: 'data/twitch_analysis.RDS' }));
  assert.match(generate('mc451', 'import-rds', { file: 'data/my-posts.RDS' }), /^analysis <- read_rds\("data\/my-posts\.RDS"\)$/m);
});

test('G16: Run it names a table the block uses that no run menu block made, and nothing else', () => {
  const known = [...COURSE_TABLES, 'posts'];
  assert.deepEqual(tablesNotMade(generate('mc451', 'count', {}), known, new Set()), ['chat']);
  assert.deepEqual(tablesNotMade(generate('mc451', 'count', {}), known, new Set(['chat'])), []);
  // a Load block makes its own tables
  assert.deepEqual(tablesNotMade(generate('mc451', 'import-course-dataset', {}), known, new Set()), []);
  assert.deepEqual(tablesNotMade(generate('mc451', 'import-rds', {}), known, new Set()), []);
  // the join reads chat and streams
  assert.deepEqual(tablesNotMade(generate('mc451', 'join-chat-streams', {}), known, new Set(['chat'])), ['streams']);
  // names inside comments, quoted text, function names, and argument names do not count
  assert.deepEqual(tablesNotMade('# chat here\nx <- read_csv("chat.csv")\nanalysis(1)\ny <- f(chat = 1)', known, new Set()), []);
  assert.deepEqual(tablesNotMade('save(posts, analysis, file = "data/a.RData")', known, new Set(['analysis'])), ['posts']);
  const menus = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'menus.ts'), 'utf8');
  assert.match(menus, /which R may not have yet\. If R says object not found, use Run my steps from the top\. Run it now\?/);
  // the button stays Run it, so every suite and video that presses it still does
  assert.match(menus, /showInformationMessage\(ask, 'Run it'\)/);
});

test('G8: a CSV column of 16-digit or longer whole numbers is read as text, and nothing else changes', () => {
  const { longNumberColumns, probeExpr } = require('../src/importFile');
  const csv = 'Item ID,post_id,Score\n5,7301928374650000062,3\n8,12,4\n';
  assert.deepEqual(longNumberColumns(csv), ['post_id']);
  assert.deepEqual(longNumberColumns('a,b\n123456789012345,x\n'), []);
  assert.deepEqual(longNumberColumns('a,b\n"-1234567890123456",y\n'), ['a']);
  const code = generate('mc451', 'import-csv', { data: 'posts', file: 'data/posts.csv', textColumns: ['post_id', 'Item ID'] });
  assert.match(code, /^posts <- read_csv\("data\/posts\.csv", col_types = cols\(post_id = col_character\(\), `Item ID` = col_character\(\)\)\)$/m);
  assert.match(code, /^# col_types reads post_id and Item ID as text: their numbers are too long for R to keep every digit\.$/m);
  assert.match(generate('mc427', 'import-csv', { data: 'df', file: 'tweets.csv', textColumns: ['id'] }), /^df <- read_csv\("tweets\.csv", col_types = cols\(id = col_character\(\)\)\)$/m);
  // with no long numbers, the 0.7.4 block, byte for byte
  for (const c of ['mc427', 'mc451', 'mc501'] as const) assert.equal(generate(c, 'import-csv', { textColumns: [] }), generate(c, 'import-csv', {}));
  assert.equal(probeExpr('C:/d/p.csv', undefined, ['post_id']), 'readr::read_csv("C:/d/p.csv", show_col_types = FALSE, col_types = readr::cols("post_id" = readr::col_character()))');
  assert.equal(probeExpr('C:/d/p.csv'), 'readr::read_csv("C:/d/p.csv", show_col_types = FALSE)');
});
