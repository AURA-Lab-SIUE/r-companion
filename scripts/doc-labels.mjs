// Harvest the Companion labels the course documents name, for the label-stability guard (0.7.5, A3).
//
// Reads every .md guide under <hub>/guides (the hub guides and the Field Guide) and every
// *-transcript.txt under <videos>, finds each Companion label they name (test/labels.ts), and
// writes golden/doc-labels.json. test/labels.test.ts then fails when any of those labels is no
// longer one the Companion shows. It also lists bold phrases in Companion steps that match no
// label, which is how a guide that already names a renamed label shows up (drift, not a failure).
//
// usage: node scripts/doc-labels.mjs <hub checkout of origin/main> <videos folder> [--write]
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { labelUniverse, labelsIn, labelPrefixes, namedLabels, shownLabels } from '../out/test/labels.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [hub, videos] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const write = process.argv.includes('--write');
if (!hub || !videos) {
  console.error('usage: node scripts/doc-labels.mjs <hub> <videos> [--write]');
  process.exit(1);
}

const walk = (d, keep) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), keep) : keep(e.name) ? [path.join(d, e.name)] : []));
// A superseded take (pre051, -v1, -v2, dry runs) is not a published video
const oldTake = /pre051|-v\d+$|dryrun/;
const docs = [
  ...walk(path.join(hub, 'guides'), (n) => n.endsWith('.md')).map((f) => ({ id: path.relative(hub, f).replace(/\\/g, '/'), file: f })),
  ...fs.readdirSync(videos).filter((d) => !oldTake.test(d)).flatMap((d) => {
    const f = path.join(videos, d, `${d}-transcript.txt`);
    return fs.existsSync(f) ? [{ id: `videos/${d}`, file: f }] : [];
  }),
];

const universe = labelUniverse();
const named = namedLabels();
const shown = [...shownLabels()].filter((l) => !named.has(l));
const prefixes = labelPrefixes();
// Keys and VS Code's own labels are not the Companion's
const KEYS = /^(Ctrl|Cmd|Command|Shift|Alt|Option)\+|^(Enter|Esc|Return|Tab)$/;
const EDITOR = new Set(['View', 'Terminal', 'Extensions', 'Explorer', 'EXPLORER', 'File', 'Open', 'Git', 'powershell', 'zsh', 'Run Cell', 'Choose where to run the selected code', 'New R Interactive window', 'Create R terminal', 'AURA Lab R Companion', 'Missed it?']);
const labels = {};
const drift = {};
const STEP = /R Companion|AURA|Write R code|Your steps|\bpanel\b/;
for (const d of docs) {
  const text = fs.readFileSync(d.file, 'utf8');
  for (const l of labelsIn(text, named, shown)) (labels[l] ??= []).push(d.id);
  if (!d.id.startsWith('guides/')) continue;
  for (const line of text.split(/\r?\n/)) {
    if (!STEP.test(line)) continue;
    for (const m of line.matchAll(/\*\*([^*]{3,90}?)\*\*/g)) {
      const p = m[1].trim();
      if (universe.has(p) || prefixes.some((x) => p.startsWith(x) || p.endsWith(x)) || /[:.,?]$/.test(p) || /^[`,.]/.test(p) || KEYS.test(p) || EDITOR.has(p)) continue;
      (drift[p] ??= new Set()).add(d.id);
    }
  }
}

const sha = spawnSync('git', ['-C', hub, 'log', '-1', '--format=%h %cs'], { encoding: 'utf8' }).stdout.trim();
const out = {
  note: 'Companion labels the course documents name. Built by scripts/doc-labels.mjs; checked by test/labels.test.ts.',
  hub: `AURA-Lab-SIUE/v2v-hub origin/main ${sha || '(unknown)'}`,
  videos: docs.filter((d) => d.id.startsWith('videos/')).map((d) => d.id.slice(7)),
  labels: Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v.sort()])),
};
console.log(`${docs.length} documents, ${Object.keys(labels).length} Companion labels named`);
console.log('Bold phrases in Companion steps that match no label (check each):');
for (const [p, ids] of Object.entries(drift).sort(([a], [b]) => a.localeCompare(b))) console.log(`  ${p}  <- ${[...ids].sort().join(', ')}`);
if (write) {
  fs.writeFileSync(path.join(ROOT, 'golden', 'doc-labels.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('wrote golden/doc-labels.json');
}
