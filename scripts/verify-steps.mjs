// Code parity check (#rgui, 2026-10-28): does a steps script the Companion writes reproduce the
// same result when it is run again from the top?
//
// For every generated golden entry this builds the student's script the way the extension does
// (appendBlock from out/src/steps, the prerequisite blocks first, then the target). It runs the
// blocks one at a time in a fresh folder, the way the panel sends each block to R, then the
// line "Run my steps from the top" sends (runStepsCode) in a second fresh folder. After each run
// it fingerprints every object the script left in the global environment and every file it wrote.
// The entry passes when both runs succeed and every fingerprint matches: the script redoes exactly
// what the panel did.
//
// usage: node scripts/verify-steps.mjs [idFilter...]
// env:   RSCRIPT, R_COMPANION_LIB, ONE_TOUCH (as in verify-run.mjs)

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { generate } from '../out/src/codegen/index.js';
import { appendBlock, runStepsCode, STEPS_FILE } from '../out/src/steps.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const GOLDEN = path.join(ROOT, 'golden');
const RSCRIPT = process.env.RSCRIPT || '/opt/homebrew/bin/Rscript';
const LIB = process.env.R_COMPANION_LIB || path.join(ROOT, '.rlib');
const ONE_TOUCH = process.env.ONE_TOUCH || '/Volumes/One Touch';
const ids = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'manifest.json'), 'utf8'));
const mapData = (canonical) => canonical.replace(/^O:\//, ONE_TOUCH + '/');

// Run the steps line, then fingerprint what it made. Objects that hold an environment (models,
// ggplot objects) are fingerprinted by what they print, everything else by its serialized bytes.
export const FINGERPRINT = `
.libPaths(c(Sys.getenv("R_COMPANION_LIB"), .libPaths()))
options(width = 80, warn = 1)
.before <- list.files(".", recursive = TRUE, all.files = TRUE)
.ok <- tryCatch({ eval(parse(text = commandArgs(TRUE)[1])); TRUE },
  error = function(e) { cat("##ERROR", conditionMessage(e), "\\n"); FALSE })
.fp <- function(x) {
  if (is.function(x) || is.environment(x)) return(NULL)
  if (inherits(x, c("ggplot", "lm", "htest", "aov", "gg"))) {
    return(digest::digest(utils::capture.output(print(x))))
  }
  digest::digest(x)
}
.objs <- setdiff(ls(globalenv()), c(".before", ".ok", ".fp"))
.out <- list(ok = .ok, objects = list(), files = list())
for (.n in .objs) { .h <- .fp(get(.n, globalenv())); if (!is.null(.h)) .out$objects[[.n]] <- .h }
for (.f in setdiff(list.files(".", recursive = TRUE, all.files = TRUE), c(.before, "fingerprint.json"))) {
  .out$files[[.f]] <- unname(tools::md5sum(.f))
}
jsonlite::write_json(.out, "fingerprint.json", auto_unbox = TRUE)
`;

// The panel's way of running: each block goes to R on its own, in order, in one session, as
// insertAndMaybeRun sends a block to the R terminal. The blocks are read from a file written
// before the run, so the file is not counted as one the script made. Each line's value prints
// when it is visible, as it does at the R prompt, so a chart opens the plot device there too.
const PANEL_LINE =
  'for (.b in jsonlite::read_json("panel-blocks.json", simplifyVector = TRUE)) for (.e in parse(text = .b)) ' +
  '{ .r <- withVisible(eval(.e, globalenv())); if (.r$visible) print(.r$value) }';

/**
 * Two runs in two fresh folders. With `blocks`, the first run is the panel's (each block on its
 * own) and the second is Run my steps from the top, so a match says the script redoes what the
 * panel did. Without it, both runs are Run my steps from the top.
 */
export function runTwice(script, data, stepsName = STEPS_FILE, blocks = null) {
  const prints = [];
  for (let run = 0; run < 2; run++) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rsteps-'));
    for (const [as, src] of data) {
      fs.mkdirSync(path.dirname(path.join(work, as)), { recursive: true });
      fs.copyFileSync(src, path.join(work, as));
    }
    const panel = blocks && run === 0;
    if (panel) fs.writeFileSync(path.join(work, 'panel-blocks.json'), JSON.stringify(blocks));
    else fs.writeFileSync(path.join(work, stepsName), script);
    fs.writeFileSync(path.join(work, 'fingerprint.R'), FINGERPRINT);
    const line = panel ? PANEL_LINE : runStepsCode(path.join(work, stepsName), work);
    const proc = spawnSync(RSCRIPT, ['--vanilla', 'fingerprint.R', line], {
      cwd: work,
      env: { ...process.env, R_COMPANION_LIB: LIB, R_CLI_NUM_COLORS: '1' },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const fpFile = path.join(work, 'fingerprint.json');
    const fp = fs.existsSync(fpFile) ? JSON.parse(fs.readFileSync(fpFile, 'utf8')) : { ok: false };
    fp.stdout = proc.stdout ?? '';
    fp.stderr = proc.stderr ?? '';
    fp.work = work;
    prints.push(fp);
  }
  return prints;
}

/** Compare two fingerprints; returns a list of differences (empty when identical). */
export function diffPrints(a, b) {
  const out = [];
  if (!a.ok || !b.ok) out.push(`run failed: ${(a.stdout + a.stderr).match(/##ERROR.*|Error.*/)?.[0] ?? 'no fingerprint'}`);
  for (const kind of ['objects', 'files']) {
    const ka = Object.keys(a[kind] ?? {});
    const kb = Object.keys(b[kind] ?? {});
    for (const k of new Set([...ka, ...kb])) {
      if ((a[kind] ?? {})[k] !== (b[kind] ?? {})[k]) out.push(`${kind.slice(0, -1)} ${k} differs`);
    }
  }
  return out;
}

const blockFor = (rel) => {
  const owner = manifest.entries.find((e) => e.file === rel);
  return owner && owner.generated
    ? generate(owner.profile, owner.task, owner.params ?? {})
    : fs.readFileSync(path.join(GOLDEN, rel), 'utf8');
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const results = [];
  for (const e of manifest.entries) {
    if (!e.generated) continue;
    if (ids.length && !ids.some((i) => e.id.includes(i))) continue;
    let script = '';
    const blocks = [...e.requires, e.file].map(blockFor);
    for (const block of blocks) script = appendBlock(script, block);
    const data = e.data.map((dt) => [dt.as, mapData(dt.canonical)]);
    const [a, b] = runTwice(script, data, STEPS_FILE, blocks);
    const diffs = diffPrints(a, b);
    const r = { id: e.id, objects: Object.keys(a.objects ?? {}).length, files: Object.keys(a.files ?? {}).length, diffs };
    results.push(r);
    console.log(`${e.id.padEnd(32)} objects=${String(r.objects).padStart(3)} files=${String(r.files).padStart(2)} ${diffs.length ? 'DIFF ' + diffs.join('; ') : 'same'}`);
    for (const p of [a, b]) fs.rmSync(p.work, { recursive: true, force: true });
  }
  const same = results.filter((r) => r.diffs.length === 0).length;
  fs.writeFileSync(path.join(ROOT, 'verify-steps.json'), JSON.stringify(results, null, 2));
  console.log(`\n${same} of ${results.length} steps scripts reran to the objects and files the panel made`);
  process.exit(same === results.length ? 0 : 2);
}
