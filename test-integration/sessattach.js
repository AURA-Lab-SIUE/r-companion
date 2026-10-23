// vscode-R 3.x attach toggle (0.5.4, #rgui), run inside a real VS Code by scripts/integration.mjs
// with AURA_IT_SUITE=test-integration/sessattach.js, vscode-R preinstalled (AURA_IT_PREINSTALL_VSIX),
// and AURA_IT_CDP_PORT set so the notifications can be read.
//
// Opens one vscode-R terminal (r.createRTerm) on the R named by AURA_IT_RTERM and records, for up to
// AURA_IT_ATTACH_WAIT ms (default 75000): every onDidChangeSessionConnection event from vscode-R's
// extension API, when R first answers a probe line (the > prompt is back), and the notifications on
// screen. Whether sess is in the R library (R_LIBS_USER) and whether "Don't ask again" was stored
// are set by the caller, so the same suite is the toggle for both.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function toastText() {
  const port = process.env.AURA_IT_CDP_PORT;
  if (!port) return null;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  for (const t of targets.filter((x) => x.type === 'page')) {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const r = await new Promise((res) => {
      ws.onmessage = (ev) => res(JSON.parse(ev.data));
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "document.querySelector('.monaco-workbench') ? [...document.querySelectorAll('.notification-toast, .notifications-list-container .monaco-list-row')].map(function(e){return e.innerText.replace(/\\s+/g,' ');}).join(' || ') : null", returnByValue: true } }));
    });
    ws.close();
    const v = r.result && r.result.result && r.result.result.value;
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

// Presses a button on vscode-R's sess notification inside this test window (DevTools, never the
// desktop). Returns the button text pressed, or null while the notification is not on screen.
async function pressSessButton(label) {
  const port = process.env.AURA_IT_CDP_PORT;
  if (!port) return null;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const expr = `(function(){ if (!document.querySelector('.monaco-workbench')) return null;
    var rows = [...document.querySelectorAll('.notification-toast, .notifications-list-container .monaco-list-row')].filter(function(e){ return /bundled sess/.test(e.innerText); });
    for (var r of rows) { var b = [...r.querySelectorAll('a.monaco-button, .monaco-button')].find(function(x){ return x.innerText.trim() === ${JSON.stringify(label)}; }); if (b) { b.click(); return b.innerText.trim(); } }
    return 'none'; })()`;
  for (const t of targets.filter((x) => x.type === 'page')) {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const r = await new Promise((res) => { ws.onmessage = (ev) => res(JSON.parse(ev.data)); ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); });
    ws.close();
    const v = r.result && r.result.result && r.result.result.value;
    if (v !== null && v !== undefined) return v === 'none' ? null : v;
  }
  return null;
}

async function run() {
  const out = { steps: [] };
  const t0 = Date.now();
  const flush = () => fs.writeFileSync(process.env.AURA_IT_OUT + '.partial', JSON.stringify(out, null, 2));
  const log = (name, value) => { out.steps.push({ name, value, ms: Date.now() - t0 }); flush(); };
  try {
    const wait = Number(process.env.AURA_IT_ATTACH_WAIT || 75000);
    const rterm = process.env.AURA_IT_RTERM;
    if (rterm) await vscode.workspace.getConfiguration('r').update('rterm.windows', rterm, vscode.ConfigurationTarget.Global);
    log('R_LIBS_USER', process.env.R_LIBS_USER || null);
    const ext = vscode.extensions.getExtension('REditorSupport.r');
    log('vscode-R', ext ? ext.packageJSON.version : 'not installed');
    const api = ext ? await ext.activate() : undefined;
    log('api keys', api ? Object.keys(api) : null);
    log('api.session keys', api && api.session ? Object.keys(api.session) : null);
    const events = [];
    if (api && api.session && typeof api.session.onDidChangeSessionConnection === 'function') {
      api.session.onDidChangeSessionConnection((e) => { events.push({ kind: e.kind, ms: Date.now() - t0 }); log('event', { kind: e.kind }); });
    }
    const probe = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'probe.txt').replace(/\\/g, '/');
    // One phase: open a vscode-R terminal and watch it. "press:<label>" also presses that button on
    // the sess notification; "install" installs the bundled sess into the first R_LIBS_USER library
    // with Rscript (what the 0.5.4 Fix it does) and opens no terminal.
    async function phase(spec) {
      if (spec === 'install') {
        const lib = (process.env.R_LIBS_USER || '').split(';')[0];
        const src = path.join(ext.extensionPath, 'dist', 'resources', 'sess').replace(/\\/g, '/');
        const rscript = path.join(path.dirname(rterm), 'Rscript.exe');
        const r = require('child_process').spawnSync(rscript, ['-e', `install.packages("${src}", repos = NULL, type = "source", lib = "${lib}")`], { encoding: 'utf8', windowsHide: true });
        return { spec, status: r.status, tail: (r.stdout + r.stderr).trim().split(/\r?\n/).slice(-2) };
      }
      const press = spec.startsWith('press:') ? spec.slice(6) : null;
      fs.rmSync(probe, { force: true });
      const startEvents = events.length;
      const p0 = Date.now();
      const before = new Set(vscode.window.terminals);
      vscode.commands.executeCommand('r.createRTerm').then(() => {}, (e) => log('r.createRTerm error', String(e)));
      let term;
      for (let i = 0; i < 100 && !term; i++) { await sleep(200); term = vscode.window.terminals.find((x) => !before.has(x)); }
      // A line typed while R is still starting can be lost, so the probe is re-sent every 10 s until
      // R answers; the first answer is when the > prompt came back
      const probeLine = `cat(R.version.string, "|", paste(.libPaths(), collapse = ";"), "|", "sess" %in% loadedNamespaces(), file = "${probe}")`;
      let answered = null, probeText = null, sessNotice = false, pressed = null, lastSent = 0;
      const until = p0 + wait;
      while (Date.now() < until) {
        if (term && !answered && Date.now() - lastSent >= 10000) { term.sendText(probeLine); lastSent = Date.now(); }
        await sleep(1000);
        if (!answered && fs.existsSync(probe)) { answered = Date.now() - p0; probeText = fs.readFileSync(probe, 'utf8'); }
        const t = await toastText();
        if (t && /bundled sess/.test(t)) sessNotice = true;
        if (press && !pressed) pressed = await pressSessButton(press);
        const connected = events.slice(startEvents).some((e) => e.kind === 'connected');
        if (answered && (connected || Date.now() - p0 - answered > 15000)) break;
      }
      const mine = events.slice(startEvents);
      const result = { spec, terminal: term ? term.name : null, connected: mine.some((e) => e.kind === 'connected'), promptBackMs: answered, probe: probeText, sessNotice, pressed };
      if (term) { term.dispose(); await sleep(3000); }
      return result;
    }
    const phases = (process.env.AURA_IT_SESS_PHASES || (process.env.AURA_IT_SESS_PRESS ? 'press:' + process.env.AURA_IT_SESS_PRESS : 'plain')).split(',');
    for (const spec of phases) log('phase', await phase(spec));
  } catch (e) {
    out.error = String(e && e.stack || e);
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
