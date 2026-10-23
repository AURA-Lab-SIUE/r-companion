// The 0.5.4 not-attached Fix it (#rgui item 5), run inside a real VS Code by scripts/integration.mjs
// with AURA_IT_SUITE=test-integration/fixconnect.js, vscode-R 3.x preinstalled, AURA_IT_RTERM
// naming R.exe, and R_LIBS_USER naming an EMPTY library.
//
// A vscode-R terminal is open and not attached. AURA: Fix not attached (the panel node and the
// explanation's button run the same steps) closes it, installs sess and its four imports, and opens
// a new vscode-R terminal, which attaches.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    await vscode.workspace.getConfiguration('auraR').update('course', 'mc427', vscode.ConfigurationTarget.Global);
    const api = await vscode.extensions.getExtension('REditorSupport.r').activate();
    const events = [];
    api.session.onDidChangeSessionConnection((e) => events.push(e.kind));
    await vscode.extensions.getExtension('aura-lab-siue.r-companion').activate();

    vscode.commands.executeCommand('r.createRTerm').then(() => {}, () => {});
    await sleep(20000);
    const before = vscode.window.terminals.map((t) => t.name);
    log('terminals before', before);
    check('before: a vscode-R terminal is open and not attached', before.some((n) => /^R Interactive/.test(n)) && !events.includes('connected'), { before, events });

    const done = await vscode.commands.executeCommand('auraR.fixNotAttached');
    log('fix returned', done);
    check('the fix closed the old terminal and installed all five', /closed 1, installed .*sess/.test(done) && !/still failing/.test(done), done);
    const until = Date.now() + 60000;
    while (Date.now() < until && !events.includes('connected')) await sleep(500);
    log('events', events);
    log('terminals after', vscode.window.terminals.map((t) => t.name));
    check('after: the new vscode-R terminal attaches', events.includes('connected'), events);
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  out.passed = out.checks.filter((c) => c.ok).length;
  out.total = out.checks.length;
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
