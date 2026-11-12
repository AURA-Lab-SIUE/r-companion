// Audit fixes 2026-11-12 (owner q-20261112-0014: R-related items only).
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { generate } from '../src/codegen';

test('F6: Bar chart from a table that already holds the numbers keeps the row order, in every course', () => {
  const v2v = generate('mc451', 'bar', { data: 'chat_by_hour', columns: ['hour'], heights: 'messages' });
  assert.match(v2v, /chat_by_hour %>%\n  ggplot\(aes\(x = fct_inorder\(as\.character\(hour\)\), y = messages\)\) \+\n  geom_col\(\) \+/);
  assert.ok(!v2v.includes('count('), 'no counting: the heights are given');
  assert.ok(!v2v.includes('coord_flip'), 'hours run left to right');
  assert.ok(v2v.includes('ggsave("figures/messages-by-hour-bar.png"'));
  assert.ok(v2v.includes('v2v::theme_v2v()') && v2v.includes('alt = "YOUR TURN'));
  assert.equal(generate('mc501', 'bar', { data: 'chat_by_hour', columns: ['hour'], heights: 'messages' }), v2v);
  const m = generate('mc427', 'bar', { data: 'funnel', columns: ['month'], heights: 'players' });
  assert.ok(m.includes('ggplot(aes(x = fct_inorder(as.character(month)), y = players))'));
  assert.ok(m.includes('ggsave("players-by-month-bar.png"') && !m.includes('theme_v2v') && !m.includes('label_comma'));
  // The counted bar is unchanged
  assert.ok(generate('mc427', 'bar', { data: 'df', columns: ['posted_from'] }).includes('count(posted_from)'));
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { projectNameProblem, newPortfolioBlock, pointAtProjectBlock, deployBlock, INLINE_R_SNIPPET, findProjects } from '../src/paper';
import { panelTree } from '../src/panelModel';
import { menuItems } from '../src/catalog';

test('F5: the White Paper blocks are the worksheet lines', () => {
  assert.equal(projectNameProblem('podcast-ads-portfolio'), undefined);
  for (const bad of ['Podcast', 'my portfolio', 'a--b', '-a', 'twitch_portfolio']) assert.ok(projectNameProblem(bad), bad);
  const np = newPortfolioBlock('podcast-ads-portfolio');
  assert.ok(np.includes('options(usethis.allow_nested_project = TRUE)\n'));
  assert.ok(np.includes('project <- "podcast-ads-portfolio"\nif (dir.exists(project)) {\n  message("Already made: using the folder you have.")\n} else {\n  v2v::new_portfolio(project)\n}\n'));
  assert.ok(pointAtProjectBlock('p').includes('project <- "p"\nfile.exists(file.path(project, "_quarto.yml"))\n'));
  assert.ok(deployBlock('p').includes('project <- "p"\nv2v::deploy_portfolio(project)\n'));
  assert.ok(deployBlock('p').includes('[y/N]'));
  assert.equal(INLINE_R_SNIPPET, '`r format(${1:nrow(analysis)}, big.mark = ",")`');
  for (const s of [np, pointAtProjectBlock('p'), deployBlock('p')]) assert.ok(!s.includes('\u2014'), 'no em dash');
});

test('F5: findProjects lists only subfolders holding _quarto.yml', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-paper-'));
  for (const d of ['b-portfolio', 'a-portfolio', 'data', '.git']) fs.mkdirSync(path.join(root, d));
  fs.writeFileSync(path.join(root, 'b-portfolio', '_quarto.yml'), 'project:\n');
  fs.writeFileSync(path.join(root, 'a-portfolio', '_quarto.yml'), 'project:\n');
  fs.writeFileSync(path.join(root, '.git', '_quarto.yml'), '');
  assert.deepEqual(findProjects(root), ['a-portfolio', 'b-portfolio']);
  assert.deepEqual(findProjects(undefined), []);
});

test('F5: the White Paper folder sits in Your steps for MC 451 and MC 501 only, and its commands are AURA commands', () => {
  const ids = (c: 'mc427' | 'mc451' | 'mc501') => {
    const all: string[] = [];
    const walk = (n: { id: string; children?: any[] }) => { all.push(n.id); n.children?.forEach(walk); };
    panelTree({ course: c, items: menuItems(c, true), crossCheck: c === 'mc427', banners: [] }).forEach(walk);
    return all;
  };
  const kids = ['steps/paper/new', 'steps/paper/point', 'steps/paper/tinytex', 'steps/paper/inline', 'steps/paper/deploy'];
  for (const c of ['mc451', 'mc501'] as const) for (const id of kids) assert.ok(ids(c).includes(id), `${c} ${id}`);
  assert.ok(!ids('mc427').some((i) => i.startsWith('steps/paper')));
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  for (const c of ['auraR.newPortfolio', 'auraR.pointAtProject', 'auraR.installPdfTool', 'auraR.insertInlineR', 'auraR.deployPortfolio'])
    assert.ok(pkg.contributes.commands.some((x: any) => x.command === c && x.category === 'AURA'), c);
});

import { hasTask } from '../src/codegen';

test('F7: List the files R can see, in every course', () => {
  for (const c of ['mc427', 'mc451', 'mc501'] as const) assert.ok(hasTask(c, 'list-files'), c);
  assert.ok(generate('mc451', 'list-files').endsWith('getwd()\nlist.files("data")\n'));
  assert.ok(generate('mc427', 'list-files').endsWith('getwd()\nlist.files()\n'));
});

import { scriptNameProblem, scriptFileName, newScriptText, listStarters } from '../src/scripts';

test('F8: New R script names and the MC 427 starters list', () => {
  assert.equal(scriptNameProblem('choose-test'), undefined);
  assert.equal(scriptNameProblem('pilot_recode.R'), undefined);
  for (const bad of ['my script', '-x', 'a/b', '.R']) assert.ok(scriptNameProblem(bad), bad);
  assert.equal(scriptFileName('memo'), 'memo.R');
  assert.equal(scriptFileName('memo.r'), 'memo.R');
  assert.ok(newScriptText().includes('library(tidyverse)'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-starters-'));
  fs.mkdirSync(path.join(root, 'starters'));
  for (const f of ['mod03-DT02-starter.R', 'mod02-week2-starter.R', 'notes.md']) fs.writeFileSync(path.join(root, 'starters', f), '');
  assert.deepEqual(listStarters(root), ['mod02-week2-starter.R', 'mod03-DT02-starter.R']);
  assert.deepEqual(listStarters(undefined), []);
  const ids = (c: 'mc427' | 'mc451') => {
    const all: string[] = [];
    const walk = (n: { id: string; children?: any[] }) => { all.push(n.id); n.children?.forEach(walk); };
    panelTree({ course: c, items: menuItems(c, true), crossCheck: c === 'mc427', banners: [] }).forEach(walk);
    return all;
  };
  assert.ok(ids('mc427').includes('steps/new') && ids('mc427').includes('steps/starter'));
  assert.ok(ids('mc451').includes('steps/new') && !ids('mc451').includes('steps/starter'));
});

test('F10: Count missing and distinct values in each column, every course', () => {
  for (const c of ['mc427', 'mc451', 'mc501'] as const) for (const t of ['count-missing', 'count-distinct']) assert.ok(hasTask(c, t), `${c} ${t}`);
  assert.ok(generate('mc451', 'count-missing', { data: 'chat' }).endsWith('chat %>%\n  summarize(across(everything(), ~ sum(is.na(.x))))\n'));
  assert.ok(generate('mc427', 'count-distinct').endsWith('df %>%\n  summarize(across(everything(), n_distinct))\n'));
});
