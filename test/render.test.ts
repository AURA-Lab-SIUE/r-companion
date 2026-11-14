import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { quartoProjectOf, renderFolderProblem } from '../src/render';
import { panelTree } from '../src/panelModel';
import { menuItems } from '../src/catalog';

function tmpTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-render-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

test('render: a worksheet in 03_Project that reads data/ gets the Execution halted warning; the top folder does not', () => {
  const root = tmpTree({ 'data/twitch_analysis.RDS': 'x', '03_Project/w.qmd': 'x' });
  const text = 'analysis <- read_rds("data/twitch_analysis.RDS")';
  assert.match(renderFolderProblem(path.join(root, '03_Project', 'w.qmd'), root, text)!, /folder 03_Project.*Execution halted/s);
  assert.equal(renderFolderProblem(path.join(root, 'w.qmd'), root, text), undefined);
  assert.equal(renderFolderProblem(path.join(root, '03_Project', 'w.qmd'), root, 'library(tidyverse)'), undefined);
  assert.equal(renderFolderProblem(path.join(root, '03_Project', 'w.qmd'), undefined, text), undefined);
});

test('render: a White Paper chapter in a subfolder of its project gets the ../data/ advice and no move; the project top is unchanged', () => {
  const root = tmpTree({
    'data/twitch_analysis.RDS': 'x',
    'twitch-portfolio/_quarto.yml': 'project:\n  type: book\n',
    'twitch-portfolio/data/derived/twitch_analysis.RDS': 'x',
    'twitch-portfolio/03-results.qmd': 'x',
    'twitch-portfolio/codebook/codebook.qmd': 'x',
    'twitch-portfolio/journals/deep/week-09.qmd': 'x',
    '03_Project/w.qmd': 'x',
  });
  const text = 'codes <- read_rds("data/derived/twitch_analysis.RDS")';
  const proj = path.join(root, 'twitch-portfolio');
  const cb = renderFolderProblem(path.join(proj, 'codebook', 'codebook.qmd'), root, text)!;
  assert.match(cb, /folder twitch-portfolio\/codebook, inside your project/);
  assert.match(cb, /type \.\.\/ in front of every data\/ \(\.\.\/ means: go up one folder first\)/);
  assert.doesNotMatch(cb, /Move the worksheet|top of your course folder/);
  assert.match(renderFolderProblem(path.join(proj, 'journals', 'deep', 'week-09.qmd'), root, text)!, /type \.\.\/\.\.\/ in front of every data\/ \(\.\.\/\.\.\/ means: go up 2 folders first\)/);
  assert.equal(renderFolderProblem(path.join(proj, '03-results.qmd'), root, text), undefined);
  assert.equal(quartoProjectOf(path.join(proj, 'codebook', 'codebook.qmd'), root), proj);
  assert.equal(quartoProjectOf(path.join(proj, '03-results.qmd'), root), proj);
  // a plain subfolder, and the course folder's own _quarto.yml, keep the 0.7.4 message and the move
  assert.equal(quartoProjectOf(path.join(root, '03_Project', 'w.qmd'), root), undefined);
  assert.match(renderFolderProblem(path.join(root, '03_Project', 'w.qmd'), root, text)!, /Move the worksheet to the top of your course folder/);
  fs.writeFileSync(path.join(root, '_quarto.yml'), 'project:\n  type: website\n');
  assert.equal(quartoProjectOf(path.join(root, '03_Project', 'w.qmd'), root), undefined);
  const rc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'renderCommands.ts'), 'utf8');
  assert.match(rc, /quartoProjectOf\(ed\.document\.fileName, root\)\n\s+\? await vscode\.window\.showWarningMessage\(problem, 'Render anyway'\)/);
});

test('the panel: Preview and Render in Your steps for MC 451 and MC 501 only; both are AURA commands', () => {
  const ids = (c: 'mc427' | 'mc451' | 'mc501') => {
    const roots = panelTree({ course: c, items: menuItems(c, true), crossCheck: c === 'mc427', banners: [] });
    const all: string[] = [];
    const walk = (n: { id: string; children?: any[] }) => { all.push(n.id); n.children?.forEach(walk); };
    roots.forEach(walk);
    return all;
  };
  for (const c of ['mc451', 'mc501'] as const) for (const id of ['steps/preview', 'steps/render']) assert.ok(ids(c).includes(id), `${c} ${id}`);
  for (const id of ['steps/preview', 'steps/render', 'steps/zip', 'data/bring']) assert.ok(!ids('mc427').includes(id), id);
  assert.ok(!ids('mc451').includes('steps/zip') && !ids('mc451').includes('data/bring'));
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  for (const c of ['auraR.renderDocument', 'auraR.previewDocument'])
    assert.ok(pkg.contributes.commands.some((x: any) => x.command === c && x.category === 'AURA'), c);
});
