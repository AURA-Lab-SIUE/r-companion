// Code parity check for the data viewer's coding sheet (#rgui, 2026-10-28).
//
// The viewer keeps hand codes in a codes file and writes R that rebuilds the coded table. This
// script plays the student: it loads a data file the way the viewer does, enters codes through
// the same CodeStore (including values with commas, quotation marks, and accents), writes the
// rebuild block the viewer inserts, runs it in R, and checks that every coded cell R rebuilt is
// exactly the value the student saw in the grid, on the row they saw it on.
//
// usage: node scripts/verify-codes.mjs       env: RSCRIPT, R_COMPANION_LIB

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { loadCsvFile, loadRDataFrame } from '../out/src/dataSource.js';
import { CodeStore } from '../out/src/codesStore.js';
import { rebuildChunk } from '../out/src/rebuild.js';

const RSCRIPT = process.env.RSCRIPT || '/opt/homebrew/bin/Rscript';
const LIB = process.env.R_COMPANION_LIB || '';
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PRE = `.libPaths(c(${JSON.stringify(LIB)}, .libPaths()))\n`;

function r(work, code) {
  fs.writeFileSync(path.join(work, 'run.R'), PRE + code);
  const p = spawnSync(RSCRIPT, ['--vanilla', 'run.R'], { cwd: work, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { code: p.status, out: (p.stdout ?? '') + (p.stderr ?? '') };
}

const VALUES = ['positive', 'neutral', 'negative, mostly', 'said "gg"', 'café', '0', '1'];

// Code a spread of rows the way a student would, in the order they would see them.
function codeRows(data, store, columns) {
  const expected = new Map();
  const n = data.rows.length;
  const picks = [0, 1, 2, Math.floor(n / 2), n - 2, n - 1].filter((i, k, a) => i >= 0 && a.indexOf(i) === k);
  picks.forEach((i, k) => {
    const id = String(data.rows[i][data.rowIdField]);
    for (const [c, col] of columns.entries()) {
      const v = VALUES[(k + c) % VALUES.length];
      store.set(id, col, v, '2026-10-28T12:00:00Z');
      expected.set(`${id}|${col}`, v);
    }
  });
  store.save();
  return expected;
}

function check(label, work, data, store, columns, expected) {
  const block = rebuildChunk({
    dataRelPath: path.relative(work, data.sourcePath).split(path.sep).join('/'),
    codesRelPath: path.relative(work, store.filePath).split(path.sep).join('/'),
    addedRowId: data.addedRowId,
    origin: data.origin,
    sourceExpr: data.sourceExpr,
    codingColumns: columns,
  });
  fs.writeFileSync(path.join(work, 'steps.R'), block);
  const res = r(work, `
suppressMessages(source("steps.R"))
out <- coded_data %>% mutate(across(everything(), as.character))
jsonlite::write_json(out, "rebuilt.json", na = "null", dataframe = "rows")
`);
  if (res.code !== 0) return { label, ok: false, why: res.out.slice(-600) };
  const rebuilt = JSON.parse(fs.readFileSync(path.join(work, 'rebuilt.json'), 'utf8'));
  const problems = [];
  if (rebuilt.length !== data.rows.length) problems.push(`rows ${rebuilt.length} vs grid ${data.rows.length}`);
  // the grid's row i is the row the student coded; R's row i must carry the same id and code
  data.rows.forEach((row, i) => {
    const id = String(row[data.rowIdField]);
    for (const col of columns) {
      const want = expected.get(`${id}|${col}`) ?? null;
      const got = rebuilt[i]?.[col] ?? null;
      if (want !== got) problems.push(`row ${i + 1} (${data.rowIdField} ${id}) ${col}: grid ${JSON.stringify(want)} vs R ${JSON.stringify(got)}`);
    }
  });
  return { label, ok: problems.length === 0, why: problems.slice(0, 5).join('; '), cells: expected.size };
}

const results = [];

// Case 1: a sample drawn with v2v and saved as a CSV, then opened in the viewer (guide 05 and 06)
{
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rcodes-'));
  fs.mkdirSync(path.join(work, 'data'));
  const made = r(work, `library(v2v); library(readr)
coding_sample <- sample_messages(twitch_chat(), n_per_channel = 2, seed = 409)
write_csv(coding_sample, "data/coding-sample.csv")`);
  if (made.code !== 0) throw new Error(made.out);
  const data = loadCsvFile(path.join(work, 'data', 'coding-sample.csv'));
  const store = new CodeStore(path.join(work, 'data', 'derived', `${data.name}-codes.csv`));
  const expected = codeRows(data, store, ['tone', 'topic']);
  results.push(check('CSV sample, two coding columns', work, data, store, ['tone', 'topic'], expected));
}

// Case 2: the course corpus opened as an R data frame (the viewer's "Twitch chat" pick)
{
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rcodes-'));
  const bridge = path.join(ROOT, 'resources', 'bridge.R');
  const run = (cmd, args) => {
    const p = spawnSync(cmd, ['--no-save', '--no-restore', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, R_LIBS: LIB } });
    return { code: p.status, stdout: p.stdout ?? '', stderr: p.stderr ?? '' };
  };
  const data = loadRDataFrame(RSCRIPT, bridge, 'v2v::twitch_chat()', 'twitch_chat', path.join(work, 'data', 'derived'), run);
  const store = new CodeStore(path.join(work, 'data', 'derived', `${data.name}-codes.csv`));
  const expected = codeRows(data, store, ['tone']);
  const c = check('R data frame twitch_chat(), one coding column', work, data, store, ['tone'], expected);
  // and the original columns R rebuilt must equal the corpus itself
  const same = r(work, `suppressMessages(source("steps.R"))
a <- coded_data %>% select(-row_id, -tone)
b <- v2v::twitch_chat()
cat("##SAME", isTRUE(all.equal(as.data.frame(a), as.data.frame(b), check.attributes = FALSE)), "\\n")
cat("##TYPES", paste(vapply(a, function(x) class(x)[1], ""), collapse = ","), "|", paste(vapply(b, function(x) class(x)[1], ""), collapse = ","), "\\n")`);
  c.originalSame = /##SAME TRUE/.test(same.out);
  c.types = same.out.match(/##TYPES (.*)/)?.[1];
  results.push(c);
}

for (const x of results) console.log(JSON.stringify(x));
const ok = results.every((x) => x.ok && x.originalSame !== false);
console.log(ok ? 'coding sheet rebuild matches the grid' : 'coding sheet rebuild DIFFERS from the grid');
process.exit(ok ? 0 : 2);
