// RData round trip for Save several tables and Load saved tables (0.7.5, A2).
//
// Builds the course tables the way the menus do, runs the generated save block, removes the
// tables, runs the generated load block, and checks that every table came back identical() to
// the one saved, and that the save block's own check (load into new.env()) changed no table.
//
// usage: node scripts/verify-rdata.mjs       env: RSCRIPT, R_COMPANION_LIB
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { generate } from '../out/src/codegen/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RSCRIPT = process.env.RSCRIPT || '/opt/homebrew/bin/Rscript';
const LIB = process.env.R_COMPANION_LIB || '';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rdata-'));
const fixture = (f) => fs.readFileSync(path.join(ROOT, 'golden', 'fixtures', 'v2v', f), 'utf8');
const tables = ['analysis', 'chat', 'streams'];
const file = 'data/rt-tables.RData';

const script = [
  `.libPaths(c(${JSON.stringify(LIB)}, .libPaths()))`,
  'suppressMessages({',
  fixture('_setup-build-analysis.R'),
  fixture('r2-import-course-dataset.R'),
  fixture('r2-import-rds.R'),
  '})',
  `kept <- mget(${JSON.stringify(tables).replace(/^\[/, 'c(').replace(/\]$/, ')')})`,
  generate('mc451', 'save-rdata', { tables, file }),
  `cat("##AFTER_CHECK", all(vapply(names(kept), function(n) identical(get(n), kept[[n]]), logical(1))), "\\n")`,
  `rm(list = names(kept))`,
  `cat("##GONE", !any(vapply(names(kept), exists, logical(1))), "\\n")`,
  generate('mc451', 'load-rdata', { file }),
  `cat("##SAME", all(vapply(names(kept), function(n) identical(get(n), kept[[n]]), logical(1))), "\\n")`,
  `cat("##NAMES", paste(sort(load(${JSON.stringify(file)}, envir = new.env())), collapse = ","), "\\n")`,
].join('\n');
fs.writeFileSync(path.join(work, 'run.R'), script);
const p = spawnSync(RSCRIPT, ['--vanilla', 'run.R'], { cwd: work, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const out = (p.stdout ?? '') + (p.stderr ?? '');
const flag = (k) => new RegExp(`##${k} TRUE`).test(out);
const result = {
  exit: p.status,
  saveCheckChangedNothing: flag('AFTER_CHECK'),
  removedBeforeLoad: flag('GONE'),
  loadedIdentical: flag('SAME'),
  names: out.match(/##NAMES (.*)/)?.[1]?.trim(),
  verbosePrinted: /Loading objects:\s+analysis\s+chat\s+streams/.test(out),
};
console.log(JSON.stringify(result));
const ok = result.exit === 0 && result.saveCheckChangedNothing && result.removedBeforeLoad && result.loadedIdentical && result.names === 'analysis,chat,streams' && result.verbosePrinted;
if (!ok) console.log(out.slice(-1500));
fs.rmSync(work, { recursive: true, force: true });
console.log(ok ? 'RData round trip: every table came back identical' : 'RData round trip FAILED');
process.exit(ok ? 0 : 2);
