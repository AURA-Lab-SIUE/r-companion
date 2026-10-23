// AURA: Make a help report (0.5.4, #rgui item 7), run inside a real VS Code by scripts/integration.mjs
// with AURA_IT_SUITE=test-integration/helpreport.js, vscode-R 3.x preinstalled, AURA_IT_RTERM naming
// R.exe, and AURA_IT_CDP_PORT set.
//
// MC 451. The command runs, the report opens as a read-only document, every section is there, the
// computer's user name and home folder appear nowhere, the Companion's own log lines are in it, and
// the notification's Copy to clipboard button (pressed in this test window over DevTools) puts the
// same text on the clipboard.
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpEval(expression) {
  const port = process.env.AURA_IT_CDP_PORT;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  for (const t of targets.filter((x) => x.type === 'page')) {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const r = await new Promise((res) => { ws.onmessage = (ev) => res(JSON.parse(ev.data)); ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })); });
    ws.close();
    const v = r.result && r.result.result && r.result.result.value;
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

async function run() {
  const out = { steps: [], checks: [] };
  const flush = () => fs.writeFileSync(process.env.AURA_IT_OUT + '.partial', JSON.stringify(out, null, 2));
  const log = (name, value) => { out.steps.push({ name, value }); flush(); };
  const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, ...(ok ? {} : { detail }) }); flush(); };
  try {
    const rterm = process.env.AURA_IT_RTERM;
    await vscode.workspace.getConfiguration('r').update('rterm.windows', rterm, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('auraR').update('rPath', path.join(path.dirname(rterm), 'Rscript.exe'), vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('auraR').update('course', 'mc451', vscode.ConfigurationTarget.Global);
    await vscode.extensions.getExtension('REditorSupport.r').activate();
    await vscode.extensions.getExtension('aura-lab-siue.r-companion').activate();
    await vscode.env.clipboard.writeText('before');
    // A check first, as a student would have run: it writes the Companion's output channel
    await vscode.commands.executeCommand('auraR.checkSetup', { course: 'mc451', silent: true });

    const text = await vscode.commands.executeCommand('auraR.makeHelpReport');
    const ed = vscode.window.activeTextEditor;
    log('open document', ed ? { scheme: ed.document.uri.scheme, path: ed.document.uri.path, lines: ed.document.lineCount } : null);
    fs.writeFileSync(path.join(path.dirname(process.env.AURA_IT_OUT), 'help-report.txt'), text);
    check('the report is the open document', ed && ed.document.getText() === text, ed && ed.document.uri.toString());
    // Typing into the editor, as a student would: a read-only document ignores it
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    await vscode.commands.executeCommand('type', { text: 'typed' });
    await sleep(500);
    check('typing into the report changes nothing (read-only)', ed.document.getText() === text && !ed.document.isDirty, ed.document.getText().slice(0, 40));
    for (const h of ['== 1. Check my setup ==', '== 2. Versions ==', '== 3. Connection between R and VS Code ==', '== 4. R Companion log', '== 5. R extension log', '== 6. Errors in the R terminal ==']) {
      check(`section: ${h}`, text.includes(h));
    }
    for (const v of ['R extension (REditorSupport.r): 3.2.0', 'R: 4.6.1', 'sess:', 'languageserver:', 'v2v:', 'processx:', 'later:', 'jsonlite:', 'rstudioapi:', 'R extension session API: available']) {
      check(`versions: ${v}`, text.includes(v));
    }
    const section4 = text.split('== 4. R Companion log')[1].split('== 5.')[0];
    check('the Companion log section carries its own lines (the check written before)', /RESULT: /.test(section4) && /setup check for MC 451/.test(section4), section4.slice(0, 300));
    const user = os.userInfo().username;
    check('no user name anywhere', !new RegExp(user, 'i').test(text), user);
    check('no home folder anywhere', !text.toLowerCase().includes(os.homedir().toLowerCase()) && !text.toLowerCase().includes(os.homedir().replace(/\\/g, '/').toLowerCase()));
    check('the last line says to email it', text.trim().split('\n').pop() === 'Paste this whole report into an email to Dr. Leith.');

    let pressed = null;
    for (let i = 0; i < 20 && !pressed; i++) {
      await sleep(500);
      pressed = await cdpEval("(function(){ var t=[...document.querySelectorAll('.notification-toast')].find(function(e){return /help report is open/.test(e.innerText);}); if(!t) return null; var b=[...t.querySelectorAll('.monaco-button')].find(function(x){return x.innerText.trim()==='Copy to clipboard';}); if(!b) return null; b.click(); return 'pressed'; })()");
    }
    await sleep(1000);
    const clip = await vscode.env.clipboard.readText();
    check('Copy to clipboard puts the report on the clipboard', pressed === 'pressed' && clip === text, { pressed, clipStart: clip.slice(0, 40) });
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  out.passed = out.checks.filter((c) => c.ok).length;
  out.total = out.checks.length;
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
