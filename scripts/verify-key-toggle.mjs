// Toggle for the coding sheet's join key (#rgui, 2026-10-28). Codes are entered on a sample, then
// the sample file's rows are put in another order (a re-sort and save in Excel does this). Keyed
// by row position (0.5.4) the codes land on other items; keyed by the item's id they stay put.
// usage: node scripts/verify-key-toggle.mjs     env: RSCRIPT, R_COMPANION_LIB

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { loadCsvFile, rekey, LEGACY } from '../out/src/dataSource.js';
import { CodeStore } from '../out/src/codesStore.js';
import { rebuildChunk } from '../out/src/rebuild.js';
import { parseCsv, writeCsv } from '../out/src/csv.js';

const RSCRIPT = process.env.RSCRIPT || '/opt/homebrew/bin/Rscript';
const LIB = process.env.R_COMPANION_LIB || '';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rkey-'));
fs.mkdirSync(path.join(work, 'data'));
const r = (code) => {
  fs.writeFileSync(path.join(work, 'run.R'), `.libPaths(c(${JSON.stringify(LIB)}, .libPaths()))\n${code}`);
  const p = spawnSync(RSCRIPT, ['--vanilla', 'run.R'], { cwd: work, encoding: 'utf8' });
  if (p.status !== 0) throw new Error(p.stdout + p.stderr);
  return p.stdout;
};
r('library(v2v); readr::write_csv(sample_messages(twitch_chat(), 2, 409), "data/coding-sample.csv")');
const csv = path.join(work, 'data', 'coding-sample.csv');

const out = {};
for (const mode of ['row position (0.5.4)', 'item id (code parity)']) {
  let data = loadCsvFile(csv);
  if (mode.startsWith('row')) data = rekey(data, LEGACY);
  const store = new CodeStore(path.join(work, 'data', 'derived', `${mode[0]}-codes.csv`));
  const entered = new Map();
  data.rows.slice(0, 10).forEach((row, i) => {
    const v = i % 2 ? 'reaction' : 'commentary';
    store.set(String(row[data.rowIdField]), 'tone', v, 't');
    entered.set(row.id, v); // what the student saw: this message (by its id) got this code
  });
  store.save();
  // the file is re-sorted after coding
  const parsed = parseCsv(fs.readFileSync(csv, 'utf8'));
  const sorted = path.join(work, 'data', `${mode[0]}-resorted.csv`);
  fs.writeFileSync(sorted, writeCsv(parsed.header, [...parsed.rows].reverse()));
  fs.writeFileSync(path.join(work, 'steps.R'), rebuildChunk({
    dataRelPath: `data/${mode[0]}-resorted.csv`,
    codesRelPath: `data/derived/${mode[0]}-codes.csv`,
    addedRowId: data.addedRowId,
    origin: 'csv',
    idColumn: data.rowIdField,
    numericIds: true,
  }));
  const got = JSON.parse(r('suppressMessages(source("steps.R")); cat(jsonlite::toJSON(coded_data %>% filter(!is.na(tone)) %>% transmute(id = as.character(id), tone)))'));
  const wrong = got.filter((g) => entered.get(String(g.id)) !== g.tone).length;
  out[mode] = `${got.length - wrong} of ${entered.size} codes still on the message they were entered on`;
}
console.log(JSON.stringify(out, null, 1));
fs.rmSync(work, { recursive: true, force: true });
