// Run every "APA numbers to check your sentence" block through Rscript and check its numbers
// against workstream B's filled sentences (golden/sentences-v2v-0.3.3.json, numbers read by regex
// from the golden test transcripts, never typed).
//
// Each block runs after the same prerequisite chain as its course's test fixture (the manifest's
// `requires` for mc427.<test> or mc451/mc501.<test>), so it reads the same data the graded test does.
//
// usage: node scripts/verify-apa.mjs
// env:   RSCRIPT, R_COMPANION_LIB, ONE_TOUCH as for verify-run.mjs.

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

const manifest = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'manifest.json'), 'utf8'));
const filled = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'sentences-v2v-0.3.3.json'), 'utf8'));

// The golden values each test's APA numbers must contain
const KEYS = {
  't-test': ['t', 'df', 'p', 'd', 'd_ci'],
  'chi-square': ['chi', 'df', 'N', 'p', 'V', 'v_ci'],
  anova: ['F', 'df1', 'df2', 'p', 'eta', 'eta_ci', 'N'],
  regression: ['b', 'se', 't', 'df2', 'p', 'F', 'df1', 'N', 'R2'],
  correlation: ['r', 'df', 'p', 'lo', 'hi'],
};

// Golden numbers padded from a rounded printout: checked at the printout's own precision
const ROUNDED = {
  'mc427.anova': {
    F: { re: /F\(2, 747\) = ([\d.]+)/, printed: 20.7, within: 0.05 },
    eta: { re: /eta squared = (\.\d+)/, printed: 0.05, within: 0.005 },
  },
};

const RUNNER = `
.libPaths(c(Sys.getenv("R_COMPANION_LIB"), .libPaths()))
options(width = 200, warn = 1)
.files <- commandArgs(TRUE)
for (.f in head(.files, -1)) invisible(capture.output(source(.f, echo = FALSE, print.eval = TRUE)))
cat("##TARGET\\n")
source(tail(.files, 1), echo = FALSE, print.eval = TRUE)
`;

const mapData = (canonical) => canonical.replace(/^O:\//, ONE_TOUCH + '/');

function materialize(rel, dest) {
  const owner = manifest.entries.find((e) => e.file === rel);
  const code = owner && owner.generated
    ? generate(owner.profile, owner.task, owner.params ?? {})
    : fs.readFileSync(path.join(GOLDEN, rel), 'utf8');
  fs.writeFileSync(dest, code);
}

let failures = 0;
const results = [];
for (const profile of ['mc427', 'mc451', 'mc501']) {
  for (const test of Object.keys(KEYS)) {
    const entry = manifest.entries.find((e) => e.id === `${profile}.${test}`);
    const gold = filled.find((f) => f.profile === profile && f.test === test);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rapa-'));
    for (const dt of entry.data) fs.copyFileSync(mapData(dt.canonical), path.join(work, dt.as));
    const chain = entry.requires.map((rel, i) => {
      const dest = path.join(work, `chain${i}-${path.basename(rel)}`);
      materialize(rel, dest);
      return dest;
    });
    const target = path.join(work, 'apa.R');
    fs.writeFileSync(target, generate(profile, `apa-${test}`));
    chain.push(target);
    fs.writeFileSync(path.join(work, 'runner.R'), RUNNER);
    const proc = spawnSync(RSCRIPT, ['--vanilla', 'runner.R', ...chain], {
      cwd: work,
      env: { ...process.env, R_COMPANION_LIB: LIB, R_CLI_NUM_COLORS: '1' },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const out = (proc.stdout ?? '').replace(/\r\n/g, '\n').split(/##TARGET\n/)[1] ?? '';
    const flat = out.replace(/(\d),(\d{3})/g, '$1$2');
    const errors = (proc.stderr ?? '').split('\n').filter((l) => l.startsWith('Error'));
    const missing = KEYS[test].filter((k) => {
      if (gold.values[k] === '' || flat.includes(String(gold.values[k]))) return false;
      // The filler read MC 427's ANOVA from a 3-significant-digit tidy printout (F 20.7, Eta2
      // 0.05) and padded it to 20.70 and .050; the exact values are F 20.684 and eta squared
      // .0525 (summary(aov) at digits = 8, 2026-10-19). Compare those two at the printout's precision.
      const tol = ROUNDED[`${profile}.${test}`]?.[k];
      const mine = tol && flat.match(tol.re);
      return !(mine && Math.abs(parseFloat(mine[1]) - tol.printed) <= tol.within);
    });
    const clean = proc.status === 0 && errors.length === 0 && missing.length === 0;
    if (!clean) failures++;
    results.push({ id: `${profile}.apa-${test}`, exit: proc.status, errors, missing, printed: out.trim() });
    console.log(`${profile}.apa-${test}`.padEnd(28), clean ? 'OK  ' : 'FAIL', out.trim());
    if (!clean) console.log('   missing', JSON.stringify(missing.map((k) => [k, gold.values[k]])), errors.slice(0, 3).join(' | '), (proc.stderr ?? '').slice(-400));
    fs.rmSync(work, { recursive: true, force: true });
  }
}
fs.writeFileSync(path.join(ROOT, 'verify-apa-0.3.3.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures} of ${results.length} APA blocks clean and matching the golden numbers`);
process.exit(failures ? 2 : 0);
