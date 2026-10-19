// Separation check: the R Companion is an AURA Lab project and must contain no SIM DAD or TASS
// source. Fails (exit 1) on any @simdad import or dependency, and on any file path or reference
// that points into a TASS source tree. Runs before every package build.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SKIP = new Set(['node_modules', '.git', 'out', 'dist']);
const TEXT = /\.(ts|js|mjs|cjs|json|md|R|r|yml|yaml|cff|txt)$/;

// What counts as a violation
const RULES = [
  { name: '@simdad import or dependency', re: /@simdad\// },
  { name: 'TASS package name', re: /\btass-(core|cli|project)\b/ },
  { name: 'TASS source path', re: /(^|[\/"'`])(tass|tass-dist|tass-workbench)[\/](packages|src|apps)[\/]/i },
  { name: 'SIM DAD repository', re: /github\.com[\/:]SIM-DAD\//i },
];
// This file names the patterns on purpose
const SELF = join('scripts', 'check-separation.mjs');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const problems = [];
let files = 0;
for (const file of walk(root)) {
  const rel = relative(root, file);
  // A TASS directory inside the repo is itself a violation
  if (rel.split(sep).some((part) => /^tass(-|$)/i.test(part))) {
    problems.push(`${rel}: TASS path inside the repository`);
    continue;
  }
  if (!TEXT.test(file) || rel === SELF) continue;
  files++;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const r of RULES) if (r.re.test(line)) problems.push(`${rel}:${i + 1}: ${r.name}: ${line.trim().slice(0, 120)}`);
  });
}

if (problems.length) {
  console.error(`Separation check FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`Separation check passed: ${files} files, no @simdad imports, no TASS paths.`);
