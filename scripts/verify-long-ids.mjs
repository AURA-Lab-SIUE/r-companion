// G8 (0.7.5): the generated CSV import keeps every digit of a 19-digit id, and the 0.7.4 read loses
// some (the toggle). Writes a two-row CSV, runs both blocks in R, and compares the ids as text.
//
// usage: node scripts/verify-long-ids.mjs       env: RSCRIPT, R_COMPANION_LIB
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { generate } from '../out/src/codegen/index.js';
import { longNumberColumns } from '../out/src/importFile.js';

const RSCRIPT = process.env.RSCRIPT || '/opt/homebrew/bin/Rscript';
const LIB = process.env.R_COMPANION_LIB || '';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'longids-'));
const ids = ['7301928374650000062', '7301928374650000063'];
const csv = `Item ID,post_id,score\n5,${ids[0]},3\n8,${ids[1]},4\n`;
fs.mkdirSync(path.join(work, 'data'));
fs.writeFileSync(path.join(work, 'data', 'posts.csv'), csv);

const textColumns = longNumberColumns(csv);
const run = (label, params) => {
  const code = generate('mc451', 'import-csv', { data: 'posts', file: 'data/posts.csv', ...params });
  const script = [`.libPaths(c(${JSON.stringify(LIB)}, .libPaths()))`, code, `cat("##IDS", format(posts$post_id, scientific = FALSE, digits = 22), "\\n")`].join('\n');
  fs.writeFileSync(path.join(work, 'run.R'), script);
  const p = spawnSync(RSCRIPT, ['--vanilla', 'run.R'], { cwd: work, encoding: 'utf8' });
  const out = (p.stdout ?? '') + (p.stderr ?? '');
  const got = out.match(/##IDS (.*)/)?.[1]?.trim().split(/\s+/) ?? [];
  return { label, exit: p.status, ids: got, kept: JSON.stringify(got) === JSON.stringify(ids) };
};
const fixed = run('0.7.5', { textColumns });
const old = run('0.7.4', {});
console.log(JSON.stringify({ textColumns, fixed, old }));
fs.rmSync(work, { recursive: true, force: true });
const ok = JSON.stringify(textColumns) === '["post_id"]' && fixed.exit === 0 && fixed.kept && old.exit === 0 && !old.kept;
console.log(ok ? 'long ids: 0.7.5 keeps every digit; 0.7.4 changes them' : 'long ids check FAILED');
process.exit(ok ? 0 : 2);
