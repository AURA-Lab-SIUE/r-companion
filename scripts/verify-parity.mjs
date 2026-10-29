// End-to-end code parity for the pilot (#rgui, 2026-10-28): the steps a student builds with the
// Companion, GUI actions included, rerun from the top to the same sample, the same codes, and the
// same reliability numbers.
//
// Each scenario plays the student through the extension's own modules:
//   1. the menu blocks are generated and appended the way Write R code writes them;
//   2. the script so far is run once, as the student would, to make the sample CSV;
//   3. that CSV is loaded the way the data viewer loads it, and codes (two passes) are entered
//      through the viewer's CodeStore, then the rebuild block the viewer appends is added;
//   4. reliability blocks come from the coding sheet's pass pairs, as the Reliability menu writes;
//   5. "Run my steps from the top" runs in TWO fresh folders that hold only steps.R and the codes
//      file. Both runs must match each other, the sample must be byte-identical to the one the
//      student coded, and every code R rebuilt must be the code the student entered on that item.
//
// usage: node scripts/verify-parity.mjs      env: RSCRIPT, R_COMPANION_LIB, ONE_TOUCH

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { generate } from '../out/src/codegen/index.js';
import { appendBlock } from '../out/src/steps.js';
import { loadCsvFile, idStampOf } from '../out/src/dataSource.js';
import { CodeStore } from '../out/src/codesStore.js';
import { rebuildChunk, codingSheetPath, idsAreShortNumbers } from '../out/src/rebuild.js';
import { passPairs, reliabilityForPair } from '../out/src/reliabilityCode.js';
import { runTwice, diffPrints } from './verify-steps.mjs';

const RSCRIPT = process.env.RSCRIPT || '/opt/homebrew/bin/Rscript';
const LIB = process.env.R_COMPANION_LIB || '';
const ONE_TOUCH = process.env.ONE_TOUCH || '/Volumes/One Touch';

function runR(work, code) {
  fs.writeFileSync(path.join(work, '_run.R'), `.libPaths(c(${JSON.stringify(LIB)}, .libPaths()))\n${code}`);
  const p = spawnSync(RSCRIPT, ['--vanilla', '_run.R'], { cwd: work, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  fs.rmSync(path.join(work, '_run.R'), { force: true });
  if (p.status !== 0) throw new Error((p.stdout ?? '') + (p.stderr ?? ''));
  return p.stdout ?? '';
}

const md5 = (f) => runMd5(f);
function runMd5(f) {
  return spawnSync(process.execPath, ['-e', `process.stdout.write(require('crypto').createHash('md5').update(require('fs').readFileSync(${JSON.stringify(f)})).digest('hex'))`], { encoding: 'utf8' }).stdout;
}

const CODES = ['positive', 'neutral', 'negative, mostly', 'said "gg"', 'café'];

/**
 * One scenario. `menu` is the list of [profile, task, params] blocks before the coding; `sample`
 * is the CSV path (relative) the sample block writes; `variables` the coding columns (each coded
 * twice when `twice`); `data` extra files to copy in.
 */
function scenario({ label, profile, menu, sample, variables, twice, data = [], extraCsv }) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rparity-'));
  for (const [as, src] of data) {
    fs.mkdirSync(path.dirname(path.join(work, as)), { recursive: true });
    fs.copyFileSync(src, path.join(work, as));
  }
  let steps = '';
  for (const [p, t, params] of menu) steps = appendBlock(steps, generate(p, t, params ?? {}));
  fs.writeFileSync(path.join(work, 'steps.R'), steps);
  if (!extraCsv) runR(work, 'source("steps.R")');

  // The data viewer: load the CSV, add the coding columns, code every other row in two passes
  const csv = path.join(work, sample);
  const viewed = loadCsvFile(csv);
  const store = new CodeStore(path.join(work, 'data', 'derived', `${viewed.name}-codes.csv`));
  store.idColumn = idStampOf(viewed);
  const columns = variables.flatMap((v) => (twice ? [`${v}_p1`, `${v}_p2`] : [v]));
  const expected = new Map();
  viewed.rows.forEach((row, i) => {
    if (i % 2 === 1) return; // half the items stay uncoded, as in a pilot in progress
    const id = String(row[viewed.rowIdField]);
    columns.forEach((col, c) => {
      // pass 2 disagrees with pass 1 on every third item, so the statistic is not trivially 1
      const pass2 = /_p2$/.test(col);
      const k = (i + c + (pass2 && i % 3 === 0 ? 1 : 0) - (pass2 ? 1 : 0)) % CODES.length;
      store.set(id, col, CODES[(k + CODES.length) % CODES.length], '2026-10-28T12:00:00Z');
      expected.set(`${id}|${col}`, CODES[(k + CODES.length) % CODES.length]);
    });
  });
  store.save();
  const rel = (f) => path.relative(work, f).split(path.sep).join('/');
  steps = appendBlock(
    steps,
    rebuildChunk({
      dataRelPath: rel(csv),
      codesRelPath: rel(store.filePath),
      sheetRelPath: codingSheetPath(viewed.name),
      addedRowId: viewed.addedRowId,
      origin: 'csv',
      idColumn: viewed.rowIdField,
      numericIds: idsAreShortNumbers(viewed.rows.map((r) => String(r[viewed.rowIdField]))),
    }),
  );
  if (twice) for (const p of passPairs(columns)) steps = appendBlock(steps, reliabilityForPair(profile, p));
  fs.writeFileSync(path.join(work, 'steps.R'), steps);

  // The instructor's rerun: a fresh folder with only the script and the codes file (and the
  // course data file, when the course reads one)
  const keep = [[rel(store.filePath), store.filePath], ...data];
  if (extraCsv) keep.push([sample, csv]);
  const [a, b] = runTwice(steps, keep);
  const problems = diffPrints(a, b);
  const sampleFile = sample;
  if (!extraCsv && a.files?.[sampleFile] !== md5(csv)) problems.push(`the rerun drew a different sample than the one coded (${sampleFile})`);
  // every coded cell in R equals the code entered on that item
  const out = path.join(a.work, 'check.json');
  fs.writeFileSync(
    path.join(a.work, '_check.R'),
    `.libPaths(c(${JSON.stringify(LIB)}, .libPaths()))\nsuppressMessages(library(tidyverse))\ns <- read_csv(${JSON.stringify(codingSheetPath(viewed.name))}, col_types = cols(.default = col_character()))\njsonlite::write_json(s, ${JSON.stringify(out)}, na = "null")\n`,
  );
  spawnSync(RSCRIPT, ['--vanilla', '_check.R'], { cwd: a.work, encoding: 'utf8' });
  const sheet = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  if (sheet.length !== viewed.rows.length) problems.push(`coding sheet has ${sheet.length} rows, the viewer showed ${viewed.rows.length}`);
  let checked = 0;
  viewed.rows.forEach((row, i) => {
    const id = String(row[viewed.rowIdField]);
    for (const col of columns) {
      const want = expected.get(`${id}|${col}`) ?? null;
      const got = sheet[i]?.[col] ?? null;
      const sameItem = viewed.addedRowId || sheet[i]?.[viewed.rowIdField] === id;
      if (!sameItem) problems.push(`row ${i + 1}: coding sheet has ${viewed.rowIdField} ${sheet[i]?.[viewed.rowIdField]}, viewer had ${id}`);
      if (want !== got) problems.push(`${viewed.rowIdField} ${id} ${col}: entered ${JSON.stringify(want)}, R has ${JSON.stringify(got)}`);
      checked++;
    }
  });
  const stat = (a.stdout.match(/Kappa = [-\d.]+|alpha = [-\d.]+/g) ?? []).join(' ');
  for (const p of [a, b]) fs.rmSync(p.work, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
  return { label, key: viewed.rowIdField, keyedBy: viewed.addedRowId ? 'row position' : `item id (${viewed.rowIdField})`, rows: viewed.rows.length, cells: checked, coded: expected.size, objects: Object.keys(a.objects ?? {}).length, files: Object.keys(a.files ?? {}).length, stat, problems: problems.slice(0, 8), ok: problems.length === 0 };
}

const results = [];
results.push(scenario({
  label: 'MC 451 pilot: corpus, sample_messages(), two passes on two variables, reliability',
  profile: 'mc451',
  menu: [['mc451', 'import-course-dataset'], ['mc451', 'sample', { n: 3 }]],
  sample: 'data/coding-sample.csv',
  variables: ['tone', 'topic'],
  twice: true,
}));
results.push(scenario({
  label: 'MC 501 pilot: corpus, dplyr sample by channel with its own seed, two passes, reliability',
  profile: 'mc501',
  menu: [['mc501', 'import-course-dataset'], ['mc501', 'sample', { data: 'chat', groupBy: '', n: 40, seed: 2027 }]],
  sample: 'data/coding-sample.csv',
  variables: ['tone'],
  twice: true,
}));
results.push(scenario({
  label: 'MC 427: practice tweets, dplyr sample of 50, one coding pass',
  profile: 'mc427',
  menu: [['mc427', 'import-csv'], ['mc427', 'sample']],
  sample: 'coding-sample.csv',
  variables: ['tone'],
  twice: false,
  data: [['mod05-E01-practice-tweets.csv', `${ONE_TOUCH}/10-teaching/2026_Fall/MC427/modules/mod05/mod05-E01-practice-tweets.csv`]],
}));
results.push(scenario({
  label: 'Long ids: the MC 451 worked pilot (19-digit tweet_id) coded in the viewer',
  profile: 'mc451',
  menu: [],
  sample: 'data/MC451-pilot-codes.csv',
  variables: ['stance'],
  twice: true,
  data: [['data/MC451-pilot-codes.csv', path.resolve('../v2v-hub/resources/examples/MC451-sampling-pilot/MC451-pilot-codes.csv')]],
  extraCsv: true,
}));

for (const r of results) console.log(JSON.stringify(r));
const ok = results.every((r) => r.ok);
console.log(ok ? `${results.length} of ${results.length} pilot scenarios reran exactly` : 'a pilot scenario did NOT rerun exactly');
process.exit(ok ? 0 : 2);
