// Measures the browser render time of the exported grid in real headless Chrome, over the DevTools
// protocol (no virtual time, so the millisecond count is real). NOT shipped. The page writes the
// render time its own onFirstDataRendered measured into #aura-loadtime; we poll for it.
//
//   node scripts/verify/cdp-measure.cjs <html-file>

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const file = process.argv[2];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9344;
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-chrome-'));
const url = 'file://' + encodeURI(file);

const chrome = cp.spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  '--window-size=1400,900', url,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json`);
  return r.json();
}

async function main() {
  // Wait for the page target with our URL.
  let page;
  for (let i = 0; i < 60; i++) {
    try {
      const ts = await targets();
      page = ts.find((t) => t.type === 'page' && t.url.startsWith('file://'));
      if (page && page.webSocketDebuggerUrl) break;
    } catch {}
    await sleep(250);
  }
  if (!page) throw new Error('Chrome did not expose a page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params) => new Promise((res) => { const m = ++id; pending.set(m, res); ws.send(JSON.stringify({ id: m, method, params })); });
  await send('Runtime.enable', {});

  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  let ms, status;
  const start = Date.now();
  for (let i = 0; i < 120; i++) {
    ms = await evalExpr("document.getElementById('aura-loadtime') && document.getElementById('aura-loadtime').textContent");
    status = await evalExpr("document.getElementById('aura-status') && document.getElementById('aura-status').textContent");
    if (ms) break;
    if (Date.now() - start > 30000) break;
    await sleep(100);
  }
  const grid = await evalExpr("document.querySelectorAll('#grid [role=\\\"row\\\"]').length");
  // Structural accessibility facts (axe/contrast is Brain's job on Pythia; this is a presence check).
  const a11y = await evalExpr(`JSON.stringify({
    gridRole: !!document.querySelector('#grid [role="grid"]'),
    gridAriaLabel: (document.querySelector('#grid [role="grid"]')||{}).getAttribute ? document.querySelector('#grid [role="grid"]').getAttribute('aria-label') : null,
    rowCountAttr: (document.querySelector('#grid [role="grid"]')||{}).getAttribute ? document.querySelector('#grid [role="grid"]').getAttribute('aria-rowcount') : null,
    gridcells: document.querySelectorAll('#grid [role="gridcell"]').length,
    colHeaders: document.querySelectorAll('#grid [role="columnheader"]').length,
    buttonsNamed: Array.from(document.querySelectorAll('button')).every(function(b){return (b.textContent||'').trim().length>0;}),
    buttonCount: document.querySelectorAll('button').length,
    toolbarRole: !!document.querySelector('[role="toolbar"]'),
    statusLive: (document.getElementById('aura-status')||{}).getAttribute ? document.getElementById('aura-status').getAttribute('aria-live') : null,
    lang: document.documentElement.getAttribute('lang')
  })`);
  console.log(`RENDER MS: ${ms || 'TIMEOUT'}`);
  console.log(`STATUS: ${status || ''}`);
  console.log(`VISIBLE ROW ELEMENTS (virtualized): ${grid}`);
  console.log(`A11Y STRUCTURE: ${a11y}`);
  ws.close();
}

function cleanup() { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {} }
main()
  .then(() => { cleanup(); process.exit(0); })
  .catch((e) => { console.error('measure failed:', e.message); cleanup(); process.exit(1); });
