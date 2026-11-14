// Label-stability guard (0.7.5, A3, #rgui F1). The hub guides, the Field Guide, and the video
// transcripts tell students what to click by its label. golden/doc-labels.json lists every
// Companion label they name (scripts/doc-labels.mjs builds it from v2v-hub origin/main and the
// published videos); this test fails when any of them is no longer one the Companion shows.
// Rebuild the list after a guide or video changes; never edit it to make a rename pass.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CATALOG } from '../src/catalog';
import { labelUniverse, labelsIn, namedLabels } from './labels';

const ROOT = path.join(__dirname, '..', '..');
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'golden', 'doc-labels.json'), 'utf8'));

/** The labels the documents name that the Companion no longer shows, with where each is named. */
function missing(universe: Set<string>): string[] {
  return Object.entries(snapshot.labels as Record<string, string[]>)
    .filter(([label]) => !universe.has(label))
    .map(([label, docs]) => `"${label}" (named in ${docs.join(', ')})`);
}

test('every Companion label the guides, Field Guide, and videos name is still on screen', () => {
  assert.ok(Object.keys(snapshot.labels).length >= 50, 'the label list looks truncated');
  assert.deepEqual(missing(labelUniverse()), []);
});

test('a seeded rename of a Write R code item fails the guard and names the guide', () => {
  const def = CATALOG.find((d) => d.task === 'import-rds')!;
  const old = def.label;
  assert.ok(snapshot.labels[old], 'the seed must be a label a guide names');
  const renamed = 'Load the saved analysis (RDS)';
  // A real rename changes the source text and the compiled catalog, so the seed changes both
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-'));
  try {
    fs.cpSync(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));
    const cat = path.join(tmp, 'src', 'catalog.ts');
    const text = fs.readFileSync(cat, 'utf8');
    assert.ok(text.includes(`'${old}'`));
    fs.writeFileSync(cat, text.split(`'${old}'`).join(`'${renamed}'`));
    def.label = renamed;
    const gone = missing(labelUniverse(tmp));
    assert.equal(gone.length, 1);
    assert.match(gone[0], /^"Load your saved analysis \(RDS\)" \(named in .*guides\/mc451\//);
  } finally {
    def.label = old;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.deepEqual(missing(labelUniverse()), []);
});

test('a seeded rename of a panel or command label fails the guard', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-'));
  try {
    fs.cpSync(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const cmd = pkg.contributes.commands.find((c: any) => c.title === 'Open an R terminal');
    assert.ok(cmd);
    cmd.title = 'Start an R terminal';
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(pkg));
    const gone = missing(labelUniverse(tmp));
    assert.ok(gone.some((g) => g.startsWith('"AURA: Open an R terminal"')), gone.join('\n'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the harvest counts a label on word edges, a short one only in bold, and plain on-screen words only in bold', () => {
  const named = ['Run my steps from the top', 'Data', 'Write R code'];
  assert.deepEqual(labelsIn('Click **Data**, then Run my steps from the top.', named), ['Data', 'Run my steps from the top']);
  assert.deepEqual(labelsIn('The Data group. Rewrite R codes.', named), []);
  assert.deepEqual(labelsIn('Pick **Use this file**. Use this file again.', [], ['Use this file', 'a number']), ['Use this file']);
  assert.deepEqual(labelsIn('Type a number.', [], ['a number']), []);
  assert.ok(namedLabels().has('AURA: Write R code'));
});
