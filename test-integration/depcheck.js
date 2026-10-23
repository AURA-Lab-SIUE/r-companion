// The R extension as a dependency (0.5.4, #rgui items 1 and 2), run inside a real VS Code by
// scripts/integration.mjs with AURA_IT_SUITE=test-integration/depcheck.js and AURA_IT_CDP_PORT set.
// Records what VS Code does with the Companion when the R extension is missing (no preinstall):
// whether it activates, what activate() reports, and the notifications on screen.
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
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "document.querySelector('.monaco-workbench') ? [...document.querySelectorAll('.notification-toast, .notifications-list-container .monaco-list-row')].map(function(e){return e.innerText.replace(/\\s+/g,' ');}).join(' || ') : null", returnByValue: true } }));
    });
    ws.close();
    const v = r.result && r.result.result && r.result.result.value;
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

async function run() {
  const out = { steps: [] };
  const log = (name, value) => { out.steps.push({ name, value }); fs.writeFileSync(process.env.AURA_IT_OUT + '.partial', JSON.stringify(out, null, 2)); };
  try {
    await sleep(8000);
    const rext = vscode.extensions.getExtension('REditorSupport.r');
    const me = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    log('R extension', rext ? rext.packageJSON.version : 'not installed');
    log('Companion found', !!me);
    log('Companion active after startup', me ? me.isActive : null);
    let activateError = null;
    try { if (me) await me.activate(); } catch (e) { activateError = String(e && e.message || e); }
    log('activate() error', activateError);
    log('Companion active after activate()', me ? me.isActive : null);
    const cmds = await vscode.commands.getCommands(true);
    log('auraR.checkSetup registered', cmds.includes('auraR.checkSetup'));
    await sleep(3000);
    log('notifications', await toastText());
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
