// The AURA panel (0.5.3, #rgui Rank 4) and Your steps (Rank 5): the pure tree model and helpers.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { panelTree, scriptBanners, spokenLabel, PanelNode } from '../src/panelModel';
import { menuItems } from '../src/catalog';

const menuItemsPure = (c: 'mc427' | 'mc451' | 'mc501') => menuItems(c, true);
import { appendBlock, runnableScript, runStepsCode, STEPS_FILE } from '../src/steps';

const flat = (nodes: PanelNode[]): PanelNode[] => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);
const tree = (course: 'mc427' | 'mc451' | 'mc501', extra: Partial<Parameters<typeof panelTree>[0]> = {}) =>
  panelTree({ course, items: menuItemsPure(course), crossCheck: course === 'mc427', banners: [], ...extra });

test('no course: no nodes, so the view shows its welcome text and the Pick my course button', () => {
  assert.deepEqual(panelTree({ items: [], crossCheck: false, banners: [] }), []);
});

test('each course: the six sections in order, with the menu items in menu order and their own labels', () => {
  for (const c of ['mc427', 'mc451', 'mc501'] as const) {
    const roots = tree(c);
    assert.deepEqual(roots.map((r) => r.id), ['setup', 'data', 'describe', 'test', 'steps', 'help'], c);
    const items = menuItemsPure(c);
    for (const [id, cat] of [['data', 'R2 Data'], ['describe', 'R3 Describe'], ['test', 'R4 Test']] as const) {
      const node = roots.find((r) => r.id === id)!;
      const tasks = node.children!.filter((n) => n.id.startsWith(`${id}/`) && !['data/viewer', 'data/objects', 'data/not-attached'].includes(n.id));
      assert.deepEqual(tasks.map((n) => n.label), items.filter((i) => i.category === cat).map((i) => i.label), `${c} ${id}`);
    }
  }
});

test('the MC 427 gates follow the menus: no reliability grid, and the Test node says it checks Copilot', () => {
  const ids = flat(tree('mc427')).map((n) => n.id);
  assert.ok(!ids.includes('data/reliability'));
  assert.equal(tree('mc427').find((r) => r.id === 'test')!.label, "Test: a check on Copilot's code");
  assert.ok(flat(tree('mc451')).some((n) => n.id === 'data/reliability'));
  assert.equal(tree('mc451').find((r) => r.id === 'test')!.label, 'Test');
});

test('a task node runs Write R code straight into that task; the grid and the test check open their own command', () => {
  const nodes = flat(tree('mc451'));
  assert.deepEqual(nodes.find((n) => n.id === 'data/count')!.command, { command: 'auraR.writeCode', args: ['count'] });
  assert.deepEqual(nodes.find((n) => n.id === 'data/reliability')!.command, { command: 'auraR.openReliabilityGrid' });
  assert.deepEqual(nodes.find((n) => n.id === 'test/check-test-choice')!.command, { command: 'auraR.checkTestChoice' });
});

test('My setup shows the last check in one line; Data links the Workspace panel and the not-attached fix', () => {
  assert.equal(flat(tree('mc451')).find((n) => n.id === 'setup/status')!.label, 'Not checked yet');
  const after = flat(tree('mc451', { setupLine: 'MC 451, R 4.5.2, 2 items to fix' })).find((n) => n.id === 'setup/status')!;
  assert.equal(after.label, 'MC 451, R 4.5.2, 2 items to fix');
  assert.equal(after.icon, 'warning');
  const nodes = flat(tree('mc501'));
  assert.equal(nodes.find((n) => n.id === 'data/objects')!.command!.command, 'auraR.openWorkspaceView');
  assert.equal(nodes.find((n) => n.id === 'data/not-attached')!.command!.command, 'auraR.fixNotAttached');
});

test('Your steps lists the banners of the open script, each a jump to its line', () => {
  const text = '# notes\n\n# ---- Load the course data ----\nchat <- twitch_chat()\n\n# ---- Count rows per group: count() ----\nchat %>%\n  count(channel)\n';
  const banners = scriptBanners(text);
  assert.deepEqual(banners, [
    { label: 'Load the course data', line: 2 },
    { label: 'Count rows per group: count()', line: 5 },
  ]);
  const steps = tree('mc451', { banners, stepsScript: 'analysis.R' }).find((r) => r.id === 'steps')!;
  assert.equal(steps.children![0].description, 'analysis.R');
  assert.deepEqual(steps.children!.slice(2).map((n) => [n.label, n.command]), [
    ['Load the course data', { command: 'auraR.goToLine', args: [2] }],
    ['Count rows per group: count()', { command: 'auraR.goToLine', args: [5] }],
  ]);
});

test('Help: the course guides for MC 451 and MC 501, the help links for every course, all through auraR.openLink', () => {
  const h451 = tree('mc451').find((r) => r.id === 'help')!.children!;
  assert.deepEqual(h451.find((n) => n.id === 'help/guides')!.command, { command: 'auraR.openLink', args: ['https://aura-lab.siue.edu/v2v-hub/guides/mc451/'] });
  const h427 = tree('mc427').find((r) => r.id === 'help')!.children!;
  assert.ok(!h427.some((n) => n.id === 'help/guides'), 'MC 427 has no public guides page');
  assert.ok(h427.some((n) => n.id.startsWith('help/link/')));
  assert.ok(flat(tree('mc501')).filter((n) => n.command?.command === 'vscode.open').length === 0);
});

test('appendBlock: one blank line between blocks, LF endings, one trailing newline', () => {
  assert.equal(appendBlock('', 'a <- 1\n'), 'a <- 1\n');
  assert.equal(appendBlock('a <- 1\n', 'b <- 2\n'), 'a <- 1\n\nb <- 2\n');
  assert.equal(appendBlock('a <- 1\r\n\r\n\r\n', 'b <- 2'), 'a <- 1\n\nb <- 2\n');
  assert.equal(STEPS_FILE, 'steps.R');
});

test('Run my steps from the top: source() for an R script, knitr::purl() first for Quarto, relative paths', () => {
  const folder = path.resolve('/course');
  assert.equal(runnableScript('a.R'), 'r');
  assert.equal(runnableScript('journal.qmd'), 'quarto');
  assert.equal(runnableScript('notes.md'), undefined);
  assert.equal(runStepsCode(path.join(folder, 'steps.R'), folder), 'source("steps.R", echo = TRUE)');
  assert.equal(runStepsCode(path.join(folder, 'week9', 'a.R'), folder), 'source("week9/a.R", echo = TRUE)');
  assert.equal(
    runStepsCode(path.join(folder, 'journal.qmd'), folder),
    'source(knitr::purl("journal.qmd", output = tempfile(fileext = ".R"), quiet = TRUE), echo = TRUE)',
  );
});

test('a screen reader hears that a Help link opens the web browser, and other nodes keep their label', () => {
  const nodes = flat(panelTree({ course: 'mc451', items: menuItemsPure('mc451'), crossCheck: false, banners: [] }));
  const links = nodes.filter((n) => n.command?.command === 'auraR.openLink');
  assert.ok(links.length > 0);
  for (const n of links) assert.ok(spokenLabel(n).endsWith(', opens in your web browser'), spokenLabel(n));
  for (const n of nodes.filter((n) => n.command?.command !== 'auraR.openLink')) {
    assert.ok(!spokenLabel(n).includes('web browser'), spokenLabel(n));
    assert.ok(spokenLabel(n).startsWith(n.label));
  }
});