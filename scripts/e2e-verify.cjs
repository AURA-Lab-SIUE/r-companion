// End-to-end verification for the data viewer and coding sheet, run on m4 against the real Twitch
// chat sample. NOT shipped (scripts/ is excluded from the VSIX). It exercises the compiled modules
// the same way the extension does, then proves in R that the generated rebuild chunk reproduces
// the coded data exactly.
//
//   node scripts/e2e-verify.cjs <path-to-csv> <path-to-Rscript>
//
// Steps: load the CSV (timed), synthesize row_id, code a sample of cells across a list column and
// a free-text column, save the long codes file atomically, generate the rebuild chunk, then run
// verify-rebuild.R which reads the original plus the codes and checks every coded cell.

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const { loadCsvFile } = require('../out/src/dataSource');
const { CodeStore } = require('../out/src/codesStore');
const { rebuildChunk } = require('../out/src/rebuild');

const csv = process.argv[2];
const rscript = process.argv[3] || 'Rscript';
if (!csv) {
  console.error('usage: node scripts/e2e-verify.cjs <csv> [Rscript]');
  process.exit(2);
}

const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-e2e-'));
const dataPath = path.join(ws, path.basename(csv));
fs.copyFileSync(csv, dataPath);
const originalHashBefore = require('crypto').createHash('sha256').update(fs.readFileSync(dataPath)).digest('hex');

const t0 = performance.now();
const data = loadCsvFile(dataPath);
const parseMs = Math.round(performance.now() - t0);
console.log(`LOAD: ${data.rows.length} rows, ${data.columns.length} columns, parse ${parseMs} ms, addedRowId=${data.addedRowId}`);
console.log(`COLUMNS: ${data.columns.map((c) => `${c.field}:${c.type}`).join(', ')}`);

// Code a spread of cells, including the first, a middle, and the last row, and values with a comma.
const lastRow = String(data.rows.length);
const samples = [
  ['1', 'tone', 'positive'],
  ['5', 'tone', 'negative'],
  ['100', 'tone', 'neutral'],
  [lastRow, 'tone', 'positive'],
  ['2', 'topic', 'gameplay'],
  ['5', 'topic', 'chat, banter'],
];
const codesPath = path.join(ws, 'data', 'derived', `${data.name}-codes.csv`);
const store = new CodeStore(codesPath);
for (const [r, c, v] of samples) store.set(r, c, v, '2026-10-19T00:00:00Z');
store.save();
console.log(`CODES: wrote ${store.toRecords().length} coded cells to ${path.relative(ws, codesPath)}`);

const chunk = rebuildChunk({
  dataRelPath: path.basename(csv),
  codesRelPath: path.relative(ws, codesPath).split(path.sep).join('/'),
  addedRowId: data.addedRowId,
  origin: 'csv',
  codingColumns: ['tone', 'topic'],
});
fs.writeFileSync(path.join(ws, 'rebuild.R'), chunk);
fs.writeFileSync(path.join(ws, 'expected.json'), JSON.stringify(samples));

const originalHashAfter = require('crypto').createHash('sha256').update(fs.readFileSync(dataPath)).digest('hex');
console.log(`ORIGINAL UNTOUCHED: ${originalHashBefore === originalHashAfter ? 'PASS' : 'FAIL'} (${originalHashBefore.slice(0, 12)})`);

const verify = path.join(__dirname, 'verify-rebuild.R');
const r = cp.spawnSync(rscript, ['--no-save', '--no-restore', verify], { cwd: ws, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
process.stdout.write(r.stdout || '');
if (r.stderr) process.stderr.write(r.stderr);
console.log(`WORKDIR: ${ws}`);
process.exit(r.status === 0 ? 0 : 1);
