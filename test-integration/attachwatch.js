// The 0.5.4 attach watch (#rgui item 4), run inside a real VS Code by scripts/integration.mjs with
// AURA_IT_SUITE=test-integration/attachwatch.js, vscode-R 3.2.0 preinstalled, AURA_IT_RTERM naming
// R.exe, and AURA_IT_CDP_PORT set. Run it twice as a toggle:
//   R_LIBS_USER without sess, AURA_IT_EXPECT_NOTICE=1: the terminal never attaches, and 30 s after
//     it opened exactly one notice says so (counted by the extension, and read from the screen)
//   R_LIBS_USER with sess,    AURA_IT_EXPECT_NOTICE=0: the terminal attaches and no notice appears
const vscode = require('vscode');
const fs = require('fs');

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
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "document.querySelector('.monaco-workbench') ? [...document.querySelectorAll('.notification-toast')].map(function(e){return e.innerText.replace(/\\s+/g,' ');}).join(' || ') : null", returnByValue: true } }));
    });
    ws.close();
    const v = r.result && r.result.result && r.result.result.value;
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

async function run() {
  const out = { steps: [], checks: [] };
  const t0 = Date.now();
  const flush = () => fs.writeFileSync(process.env.AURA_IT_OUT + '.partial', JSON.stringify(out, null, 2));
  const log = (name, value) => { out.steps.push({ name, value, ms: Date.now() - t0 }); flush(); };
  const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, ...(ok ? {} : { detail }) }); flush(); };
  try {
    const expect = process.env.AURA_IT_EXPECT_NOTICE === '1';
    await vscode.workspace.getConfiguration('r').update('rterm.windows', process.env.AURA_IT_RTERM, vscode.ConfigurationTarget.Global);
    const api = await vscode.extensions.getExtension('REditorSupport.r').activate();
    const events = [];
    api.session.onDidChangeSessionConnection((e) => events.push(e.kind));
    await vscode.extensions.getExtension('aura-lab-siue.r-companion').activate();
    log('R_LIBS_USER', process.env.R_LIBS_USER);
    vscode.commands.executeCommand('r.createRTerm').then(() => {}, () => {});
    const opened = Date.now();
    let seen = null;
    while (Date.now() - opened < 45000) {
      await sleep(1000);
      const t = await toastText();
      if (t && /has not connected/.test(t)) { seen = { ms: Date.now() - opened, text: t.split(' || ').find((x) => /has not connected/.test(x)) }; break; }
    }
    const diag = await vscode.commands.executeCommand('auraR.diagnostics');
    log('events', events);
    log('notice on screen', seen);
    log('attachNotices', diag.attachNotices);
    check(expect ? 'without sess: never attached' : 'with sess: attached', expect ? !events.includes('connected') : events.includes('connected'), events);
    check(expect ? 'without sess: one notice, counted by the extension' : 'with sess: no notice counted', diag.attachNotices === (expect ? 1 : 0), diag.attachNotices);
    check(expect ? 'without sess: the notice is on screen after about 30 s' : 'with sess: no notice on screen in 45 s', expect ? !!seen && seen.ms >= 29000 : !seen, seen);
    if (seen) check('the notice names the bell and Fix not attached', /bell/.test(seen.text) && /Fix not attached/.test(seen.text), seen.text);
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  out.passed = out.checks.filter((c) => c.ok).length;
  out.total = out.checks.length;
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
