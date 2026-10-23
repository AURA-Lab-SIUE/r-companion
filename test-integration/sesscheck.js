// The 0.5.4 sess row (#rgui item 3), run inside a real VS Code by scripts/integration.mjs with
// AURA_IT_SUITE=test-integration/sesscheck.js, vscode-R 3.x preinstalled (AURA_IT_PREINSTALL_VSIX),
// AURA_IT_RTERM naming R.exe, R_LIBS_USER naming an EMPTY library, and AURA_IT_CDP_PORT set.
//
// 1. Check my setup (MC 427) shows sess and its four imports as MISSING for this R.
// 2. A vscode-R terminal opened now does not attach (the sess question waits under the bell).
// 3. Install what is missing, limited to those five, installs them; the re-check reads sess OK.
// 4. A new vscode-R terminal attaches: vscode-R's onDidChangeSessionConnection says "connected".
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SESS_ROWS = ['sess', 'processx', 'later', 'jsonlite', 'rstudioapi'];

async function run() {
  const out = { steps: [], checks: [] };
  const t0 = Date.now();
  const flush = () => fs.writeFileSync(process.env.AURA_IT_OUT + '.partial', JSON.stringify(out, null, 2));
  const log = (name, value) => { out.steps.push({ name, value, ms: Date.now() - t0 }); flush(); };
  const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, ...(ok ? {} : { detail }) }); flush(); };
  try {
    const rterm = process.env.AURA_IT_RTERM;
    await vscode.workspace.getConfiguration('r').update('rterm.windows', rterm, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('auraR').update('rPath', path.join(path.dirname(rterm), 'Rscript.exe'), vscode.ConfigurationTarget.Global);
    const ext = vscode.extensions.getExtension('REditorSupport.r');
    const api = await ext.activate();
    const events = [];
    api.session.onDidChangeSessionConnection((e) => events.push({ kind: e.kind, ms: Date.now() - t0 }));
    await vscode.extensions.getExtension('aura-lab-siue.r-companion').activate();
    const rows = (r) => r.items.filter((i) => SESS_ROWS.includes(i.name)).map((i) => ({ name: i.name, status: i.status, detail: i.detail }));

    const before = await vscode.commands.executeCommand('auraR.checkSetup', { course: 'mc427', silent: true });
    log('check before: R', before.probe && before.probe.r.version);
    log('check before: sess rows', rows(before));
    check('before: sess and four imports are MISSING', SESS_ROWS.every((n) => rows(before).some((x) => x.name === n && x.status === 'missing')), rows(before));

    const attachWithin = async (label, ms) => {
      const start = events.length;
      const known = new Set(vscode.window.terminals);
      vscode.commands.executeCommand('r.createRTerm').then(() => {}, () => {});
      let term;
      for (let i = 0; i < 100 && !term; i++) { await sleep(200); term = vscode.window.terminals.find((x) => !known.has(x)); }
      const until = Date.now() + ms;
      while (Date.now() < until && !events.slice(start).some((e) => e.kind === 'connected')) await sleep(500);
      const connected = events.slice(start).some((e) => e.kind === 'connected');
      log(`${label}: connected`, connected);
      if (term) { term.dispose(); await sleep(3000); }
      return connected;
    };
    check('before: a vscode-R terminal does not attach', !(await attachWithin('terminal before', 40000)));

    const inst = await vscode.commands.executeCommand('auraR.installMissing', { course: 'mc427', silent: true, packages: SESS_ROWS });
    log('install', { attempted: inst.attempted, verified: inst.verified, stillFailing: inst.stillFailing });
    check('install: all five verified from the library', SESS_ROWS.every((n) => inst.verified.includes(n)), inst);
    log('check after: sess rows', rows(inst.after));
    check('after: the sess row reads OK', rows(inst.after).some((x) => x.name === 'sess' && x.status === 'ok'), rows(inst.after));
    check('after: no import rows remain', rows(inst.after).every((x) => x.name === 'sess'), rows(inst.after));

    check('after: a vscode-R terminal attaches', await attachWithin('terminal after', 60000));
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  out.passed = out.checks.filter((c) => c.ok).length;
  out.total = out.checks.length;
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
