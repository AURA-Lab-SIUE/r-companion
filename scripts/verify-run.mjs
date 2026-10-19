// Run every GENERATED snippet through Rscript on m4 and assert its must_print patterns.
//
// This proves the code the templates write actually runs clean against the course data, the same
// check workstream B ran (golden.py). It generates each fixture from the TypeScript templates
// (out/src/codegen), writes the prerequisite chain and data into a fresh temp folder, runs it at
// console width 80, and checks exit code, Error lines, and every must_print regex.
//
// usage: node scripts/verify-run.mjs [--v2v 0.3.2|0.3.3] [idFilter...]
// env:   RSCRIPT (default /opt/homebrew/bin/Rscript), R_COMPANION_LIB (extra library),
//        ONE_TOUCH (default /Volumes/One Touch) maps the manifest's O:/ data paths.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { generate } from '../out/src/codegen/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const GOLDEN = path.join(ROOT, 'golden');
const RSCRIPT = process.env.RSCRIPT || '/opt/homebrew/bin/Rscript';
const LIB = process.env.R_COMPANION_LIB || path.join(ROOT, '.rlib');
const ONE_TOUCH = process.env.ONE_TOUCH || '/Volumes/One Touch';

const args = process.argv.slice(2);
let v2vVersion = '0.3.2';
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--v2v') v2vVersion = args[++i];
  else ids.push(args[i]);
}

const manifest = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'manifest.json'), 'utf8'));

// The R runner: source each prerequisite quietly, then echo the target with print.eval on.
const RUNNER = `
.libPaths(c(Sys.getenv("R_COMPANION_LIB"), .libPaths()))
options(width = 80, warn = 1)
.files <- commandArgs(TRUE)
for (.f in head(.files, -1)) invisible(capture.output(source(.f, echo = FALSE, print.eval = TRUE)))
cat("##TARGET\\n")
source(tail(.files, 1), echo = TRUE, max.deparse.length = Inf, print.eval = TRUE)
`;

// Map the manifest's O:/ canonical path to this host's One Touch mount.
const mapData = (canonical) => canonical.replace(/^O:\//, ONE_TOUCH + '/');

// Resolve the generator profile/task for a manifest entry (proposal entries use v2v-plain).
function profileFor(e) {
  return e.role === 'proposal' ? 'v2v-plain' : e.profile;
}

// Write a fixture file (generated from templates, or copied from golden if not generated).
function materialize(relFile, destDir) {
  const dest = path.join(destDir, path.basename(relFile));
  // Find the manifest entry whose file is relFile to know how to generate it.
  const owner = manifest.entries.find((e) => e.file === relFile);
  if (owner && owner.generated) {
    fs.writeFileSync(dest, generate(profileFor(owner), owner.task, {}, { ...owner.options, v2vVersion }));
  } else {
    fs.copyFileSync(path.join(GOLDEN, relFile), dest);
  }
  return dest;
}

const results = [];
const done = new Map(); // (file + requires) -> result, to share mc451/mc501 runs

for (const e of manifest.entries) {
  if (!e.generated) continue;
  if (ids.length && !ids.includes(e.id)) continue;
  const key = e.file + '|' + e.requires.join(',');
  if (done.has(key)) {
    results.push({ ...done.get(key), id: e.id, shared_with: done.get(key).id });
    continue;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rcomp-'));
  for (const dt of e.data) fs.copyFileSync(mapData(dt.canonical), path.join(work, dt.as));
  // Materialize the chain into work/, numbered so basenames stay unique and order is preserved.
  const chain = [];
  [...e.requires, e.file].forEach((rel, i) => {
    const src = materialize(rel, work);
    const numbered = path.join(work, `chain${i}-${path.basename(rel)}`);
    fs.renameSync(src, numbered);
    chain.push(numbered);
  });
  fs.writeFileSync(path.join(work, 'runner.R'), RUNNER);

  const proc = spawnSync(RSCRIPT, ['--vanilla', 'runner.R', ...chain], {
    cwd: work,
    env: { ...process.env, R_COMPANION_LIB: LIB, R_CLI_NUM_COLORS: '1' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const code = proc.status ?? 1;
  const stdout = proc.stdout ?? '';
  const stderr = proc.stderr ?? '';
  const target = stdout.split('##TARGET\n')[1] ?? stdout;
  const hay = target + '\n' + stderr;
  const missing = e.must_print.filter((m) => !new RegExp(m).test(hay));
  const errors = stderr.split('\n').filter((l) => l.startsWith('Error'));
  const r = { id: e.id, file: e.file, exit: code, errors, missing, clean: code === 0 && errors.length === 0 && missing.length === 0 };
  results.push(r);
  done.set(key, r);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`${r.id.padEnd(30)} exit=${r.exit} clean=${r.clean}` + (missing.length ? ` MISSING=${JSON.stringify(missing)}` : '') + (errors.length ? ` ERR=${errors[0]}` : ''));
}

const clean = results.filter((r) => r.clean).length;
fs.writeFileSync(path.join(ROOT, `verify-run-${v2vVersion}.json`), JSON.stringify(results, null, 2));
console.log(`\n${clean} clean of ${results.length} (v2v ${v2vVersion})`);
process.exit(clean === results.length ? 0 : 2);
