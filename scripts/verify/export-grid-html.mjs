// Write a standalone copy of the reliability grid to disk for the accessibility pass.
//
// axe runs through C:/pythia/tools/web_qa.py on Pythia (Brain's job), outside VS Code, so the
// --vscode-* theme variables would be empty. The standalone copy fills them with readable,
// contrast-checked fallbacks and drops the live CSP. The webview the student sees is unchanged.
//
// usage: node scripts/verify/export-grid-html.mjs [outPath]   (default dist/reliability-grid.axe.html)

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { buildGridHtml, DEFAULT_GRID } from '../../out/src/grid.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(HERE, '..', '..', 'dist', 'reliability-grid.axe.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buildGridHtml(DEFAULT_GRID, { standalone: true }));
console.log('Wrote standalone reliability grid for axe:', out);
