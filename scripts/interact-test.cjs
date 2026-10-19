// Verifies the coding interaction in real Chromium: editing a coding cell fires onCellValueChanged
// and posts a codeChange with the right row id, column, and value, and that editing a data cell
// posts nothing (data is read only). NOT shipped.
//
//   node scripts/interact-test.cjs <csv>
//
// Builds an HTML like the export but with a capturing acquireVsCodeApi, so grid.js takes the
// webview path and its posts land in window.__posted. Then drives AG Grid's api over the DevTools
// protocol and reads back what was posted.

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadCsvFile } = require('../out/src/dataSource');
const { standaloneHtml } = require('../out/src/gridHtml');

const csv = process.argv[2];
const data = loadCsvFile(csv);
data.rows = data.rows.slice(0, 50);
const init = {
  title: `${data.name} (test)`,
  columns: data.columns,
  rows: data.rows,
  rowIdField: data.rowIdField,
  codingColumns: [{ name: 'tone', kind: 'list', values: ['positive', 'neutral', 'negative'] }],
  codes: {},
};
const media = path.join(__dirname, '..', 'media', 'grid');
const read = (p) => fs.readFileSync(path.join(media, p), 'utf8');
let html = standaloneHtml({
  agGridJs: read('ag-grid-community.min.js'), agGridCss: read('ag-grid.min.css'),
  themeCss: read('ag-theme-quartz.min.css'), gridCss: read('grid.css'), gridJs: read('grid.js'),
  init, title: init.title,
});
// Inject a capturing VS Code API before grid.js runs, and an immediate 'init' responder.
const inject = `<script>window.__posted=[];window.acquireVsCodeApi=function(){return {postMessage:function(m){window.__posted.push(m);}}};</script>`;
html = html.replace('<script>window.__AURA_INIT__', inject + '\n<script>window.__AURA_INIT__');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-int-'));
const file = path.join(dir, 'interact.html');
fs.writeFileSync(file, html);

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9355;
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-chrome-'));
const chrome = cp.spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`, 'file://' + encodeURI(file)], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let page;
  for (let i = 0; i < 60; i++) {
    try { const ts = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); page = ts.find((t) => t.type === 'page' && t.url.startsWith('file://')); if (page?.webSocketDebuggerUrl) break; } catch {}
    await sleep(250);
  }
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const evalExpr = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result?.result?.value; };
  await send('Runtime.enable', {});

  for (let i = 0; i < 100 && !(await evalExpr("!!window.__auraApi")); i++) await sleep(100);

  // Edit a coding cell on row_id 1 -> should post a codeChange.
  await evalExpr("window.__auraApi.getRowNode('1').setDataValue('tone','positive')");
  // Try to change a data cell (read only) -> AG Grid should not fire a value change for it.
  await evalExpr("window.__auraApi.getRowNode('2').setDataValue('channel','HACKED')");
  await sleep(200);
  const posted = await evalExpr("JSON.stringify(window.__posted)");
  const channelAfter = await evalExpr("window.__auraApi.getRowNode('2').data.channel");
  ws.close();

  const msgs = JSON.parse(posted || '[]');
  const code = msgs.find((m) => m.type === 'codeChange');
  const dataChangePosted = msgs.some((m) => m.type === 'codeChange' && m.column === 'channel');
  console.log('POSTED:', posted);
  console.log(`coding edit posted codeChange {row 1, tone, positive}: ${code && code.rowId === '1' && code.column === 'tone' && code.value === 'positive' ? 'PASS' : 'FAIL'}`);
  console.log(`read-only data cell did NOT post a code for channel: ${!dataChangePosted ? 'PASS' : 'FAIL'}`);
  console.log(`rendered callback posted: ${msgs.some((m) => m.type === 'rendered') ? 'PASS' : 'FAIL'}`);
  console.log(`'ready' NOT sent in init mode (built immediately): ${!msgs.some((m) => m.type === 'ready') ? 'PASS' : 'note'}`);
  return code && code.value === 'positive' && !dataChangePosted;
}

function cleanup() { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
main().then((ok) => { cleanup(); process.exit(ok ? 0 : 1); }).catch((e) => { console.error('interact failed:', e.message); cleanup(); process.exit(1); });
