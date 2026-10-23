// Drives the coding sheet with REAL key and mouse events (DevTools Input.dispatchKeyEvent and
// Input.dispatchMouseEvent, which reach the page as trusted events, the way a keyboard's do) in
// headless Chrome, and checks the spreadsheet keys of 0.4.1: typeahead in a code list column,
// Enter commits and moves down, Tab commits and moves right, Escape cancels, F2 and a double-click
// open the whole list, Delete clears, Ctrl+Z undoes, and a free-text column types and commits.
// Also reads what a screen reader is given: the combobox name, the active option, the live text.
// NOT shipped.
//
//   node scripts/verify/keys-test.cjs <csv> [shots dir] [dark]
//
// Chrome: CHROME_PATH, else the usual Windows or macOS install.

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadCsvFile } = require('../../out/src/dataSource');
const { standaloneHtml } = require('../../out/src/gridHtml');

const [csv, shotsDir, theme] = process.argv.slice(2);
const data = loadCsvFile(csv);
data.rows = data.rows.slice(0, 50);
const init = {
  title: `${data.name} (keys test)`,
  columns: data.columns,
  rows: data.rows,
  rowIdField: data.rowIdField,
  codingColumns: [
    { name: 'tone', kind: 'list', values: ['positive', 'neutral', 'negative'] },
    { name: 'topic', kind: 'free' },
  ],
  codes: {},
};
const media = path.join(__dirname, '..', '..', 'media', 'grid');
const read = (p) => fs.readFileSync(path.join(media, p), 'utf8');
let html = standaloneHtml({
  agGridJs: read('ag-grid-community.min.js'), agGridCss: read('ag-grid.min.css'),
  themeCss: read('ag-theme-quartz.min.css'), gridCss: read('grid.css'), gridJs: read('grid.js'),
  init, title: init.title,
});
const inject = `<script>window.__posted=[];window.acquireVsCodeApi=function(){return {postMessage:function(m){window.__posted.push(m);}}};</script>`;
html = html.replace('<script>window.__AURA_INIT__', inject + '\n<script>window.__AURA_INIT__');
if (theme === 'dark') {
  // The Dark Modern values VS Code sets on a webview, so the editor is seen in a dark theme too
  html = html.replace('<body>', '<body class="vscode-dark">').replace('<html lang="en">', `<html lang="en" style="--vscode-foreground:#cccccc;--vscode-editor-background:#1f1f1f;--vscode-panel-border:#2b2b2b;--vscode-focusBorder:#0078d4;--vscode-sideBarSectionHeader-background:#181818;--vscode-list-hoverBackground:#2a2d2e;--vscode-list-activeSelectionBackground:#04395e;--vscode-list-activeSelectionForeground:#ffffff;--vscode-input-background:#313131;--vscode-input-foreground:#cccccc;--vscode-input-border:#3c3c3c;--vscode-button-background:#0078d4;--vscode-button-foreground:#ffffff;--vscode-button-hoverBackground:#026ec1;--vscode-editorWidget-background:#202020;--vscode-descriptionForeground:#9d9d9d">`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-keys-'));
const file = path.join(dir, 'keys.html');
fs.writeFileSync(file, html);

const CHROME = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const PORT = 9356;
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-chrome-'));
const chrome = cp.spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--window-size=1400,900',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`, 'file:///' + file.replace(/\\/g, '/')], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Key definitions for Input.dispatchKeyEvent
const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  Delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
  F2: { key: 'F2', code: 'F2', windowsVirtualKeyCode: 113 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
};
const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

async function main() {
  let page;
  for (let i = 0; i < 80; i++) {
    try { const ts = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); page = ts.find((t) => t.type === 'page' && t.url.startsWith('file:')); if (page?.webSocketDebuggerUrl) break; } catch {}
    await sleep(250);
  }
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value; };
  await send('Runtime.enable', {});
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 100 && !(await ev('!!window.__auraApi && window.__auraApi.getDisplayedRowCount() > 0')); i++) await sleep(100);

  const press = async (name, mods = []) => {
    const k = KEYS[name];
    const modifiers = mods.reduce((a, m) => a | MOD[m], 0);
    await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', modifiers, ...k });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...k, text: undefined });
    await sleep(150);
  };
  const typeChar = async (ch) => {
    const upper = ch !== ch.toLowerCase();
    const code = /[a-z]/i.test(ch) ? 'Key' + ch.toUpperCase() : ch === ' ' ? 'Space' : '';
    const vk = ch === ' ' ? 32 : ch.toUpperCase().charCodeAt(0);
    const modifiers = upper ? MOD.shift : 0;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, windowsVirtualKeyCode: vk, text: ch, unmodifiedText: ch.toLowerCase(), modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk, modifiers });
    await sleep(120);
  };
  const type = async (s) => { for (const ch of s) await typeChar(ch); };
  const ctrlZ = async () => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: MOD.ctrl });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: MOD.ctrl });
    await sleep(200);
  };
  const cellBox = (rowIndex, col) => ev(`(function(){window.__auraApi.ensureColumnVisible('${col}');window.__auraApi.ensureIndexVisible(${rowIndex});var c=document.querySelector('.ag-row[row-index="${rowIndex}"] [role=gridcell][col-id="${col}"]');if(!c)return null;var r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const click = async (rowIndex, col, count = 1) => {
    await cellBox(rowIndex, col); await sleep(200);
    const b = await cellBox(rowIndex, col);
    if (!b) throw new Error(`no cell ${rowIndex} ${col}: ` + await ev(`(function(){var r=document.querySelector(".ag-row");return r?r.outerHTML.slice(0,600):document.body.innerHTML.slice(0,800);})()`));
    for (let n = 1; n <= count; n++) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: n });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: n });
    }
    await sleep(250);
  };
  const snap = () => ev(`(function(){var a=window.__auraApi;var f=a.getFocusedCell();var ed=a.getEditingCells();var inp=document.querySelector('.aura-code-input');var act=inp&&inp.getAttribute('aria-activedescendant');var actEl=act&&document.getElementById(act);var live=document.querySelector('.aura-code-editor .aura-sr-only');var opts=[].map.call(document.querySelectorAll('.aura-code-list [role=option]'),function(o){return o.textContent;});return {focus:f?{row:f.rowIndex,col:f.column.getColId()}:null,editing:ed.map(function(c){return c.rowIndex+':'+c.column.getColId();}),input:inp?inp.value:null,role:inp?inp.getAttribute('role'):null,name:inp?inp.getAttribute('aria-label'):null,active:actEl?actEl.textContent:null,activeSelected:actEl?actEl.getAttribute('aria-selected'):null,options:opts,live:live?live.textContent:null,docFocus:document.activeElement&&(document.activeElement.className||document.activeElement.tagName),status:document.getElementById('aura-status').textContent,statusRole:document.getElementById('aura-status').getAttribute('role')};})()`);
  const val = (rowIndex, col) => ev(`window.__auraApi.getDisplayedRowAtIndex(${rowIndex}).data['${col}'] || ''`);
  const posts = () => ev(`JSON.stringify(window.__posted.filter(function(m){return m.type==='codeChange';}))`).then(JSON.parse);
  const shot = async (name) => {
    if (!shotsDir) return;
    fs.mkdirSync(shotsDir, { recursive: true });
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shotsDir, `${theme === 'dark' ? 'dark' : 'light'}-${name}.png`), Buffer.from(r.result.data, 'base64'));
  };

  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(detail)}`); };

  // 1. Typeahead: click row 0's tone cell, type "n": the editor opens filtered, first match chosen
  await click(0, 'tone');
  await type('n');
  let s = await snap();
  await shot('1-typed-n');
  check('typing n opens the editor with one n, matches neutral and negative, neutral chosen',
    s.editing.join() === '0:tone' && s.input === 'n' && s.options.join() === 'neutral,negative' && s.active === 'neutral', s);
  check('screen reader: combobox named for the column and row, active option aria-selected, live text names the choice',
    s.role === 'combobox' && /^tone, row 1/.test(s.name) && s.activeSelected === 'true' && /^neutral, 1 of 2/.test(s.live) && s.docFocus === 'aura-code-input', s);
  await type('eg');
  s = await snap();
  check('typing "neg" narrows to negative', s.input === 'neg' && s.options.join() === 'negative' && s.active === 'negative', s);
  await shot('2-typed-neg');
  await press('Enter');
  s = await snap();
  check('Enter commits negative and moves down a row, not editing', (await val(0, 'tone')) === 'negative' && s.focus.row === 1 && s.focus.col === 'tone' && s.editing.length === 0, s);
  check('status (role=status, polite) names the code entered', s.statusRole === 'status' && /tone, row 1: negative\./.test(s.status), s.status);
  let p = await posts();
  check('a codeChange was posted for row 1', p.length === 1 && p[0].column === 'tone' && p[0].value === 'negative', p);

  // 2. Case-insensitive, and Tab commits and moves right
  await type('P');
  s = await snap();
  check('typing capital P picks positive', s.active === 'positive', s);
  await press('Tab');
  s = await snap();
  check('Tab commits positive and moves right to topic, not editing', (await val(1, 'tone')) === 'positive' && s.focus.row === 1 && s.focus.col === 'topic' && s.editing.length === 0, s);

  // 3. Free text: typing starts the edit, Enter commits and moves down
  await type('game play');
  s = await snap();
  check('free text: typing opens a text editor', s.editing.join() === '1:topic', s);
  await shot('3-free-text');
  await press('Enter');
  s = await snap();
  check('free text: Enter commits "game play" and moves down', (await val(1, 'topic')) === 'game play' && s.focus.row === 2 && s.focus.col === 'topic' && s.editing.length === 0, s);
  await press('Tab', ['shift']);
  s = await snap();
  check('Shift+Tab (not editing) moves left to tone', s.focus.col === 'tone' && s.focus.row === 2, s);

  // 4. No match: the cell stays as it was
  const before4 = (await posts()).length;
  await type('x');
  s = await snap();
  check('typing x shows "No code starts with"', s.options.length === 1 && /No code starts with "x"/.test(s.options[0]) && /No code starts with/.test(s.live), s);
  await shot('4-no-match');
  await press('Enter');
  s = await snap();
  check('Enter on no match stays in the editor (nothing saved, no move) and says why', s.editing.join() === '2:tone' && /Backspace to change the letters/.test(s.live), s);
  await press('Tab');
  check('Tab on no match also stays', (await snap()).editing.join() === '2:tone', await snap());
  await press('Escape');
  s = await snap();
  check('Escape then leaves the cell blank, posts nothing, focus stays', (await val(2, 'tone')) === '' && (await posts()).length === before4 && s.editing.length === 0 && s.focus.row === 2, s);

  // 5. Backspace clears the typed letters to a blank choice; Escape cancels
  await press('ArrowUp');
  await press('ArrowUp');
  s = await snap();
  check('arrows (not editing) navigate: back on row 0 tone', s.focus.row === 0 && s.focus.col === 'tone', s);
  await type('p');
  await press('Backspace');
  s = await snap();
  check('Backspace takes the letter back: the blank choice is active, whole list shown', s.input === '' && /^\(blank/.test(s.active) && s.options.length === 4, s);
  await press('Escape');
  s = await snap();
  check('Escape cancels: row 0 keeps negative', (await val(0, 'tone')) === 'negative' && s.editing.length === 0 && s.focus.row === 0, s);

  // 6. F2 opens the whole list on the current code; arrows move; Enter commits
  await press('F2');
  s = await snap();
  check('F2 opens the whole list with the current code (negative) chosen', s.editing.join() === '0:tone' && s.options.length === 4 && s.active === 'negative', s);
  await shot('5-f2-whole-list');
  await press('ArrowUp');
  s = await snap();
  check('Up in the list chooses neutral (the grid does not move)', s.active === 'neutral' && s.editing.join() === '0:tone', s);
  await press('Enter');
  check('Enter commits neutral and moves down', (await val(0, 'tone')) === 'neutral' && (await snap()).focus.row === 1, await snap());

  // 7. Delete clears; Ctrl+Z undoes
  await press('ArrowUp');
  await press('Delete');
  s = await snap();
  check('Delete clears the focused coding cell and stays there', (await val(0, 'tone')) === '' && s.focus.row === 0 && s.focus.col === 'tone' && s.editing.length === 0, s);
  p = await posts();
  check('the clear was posted as a blank code', p.length && p[p.length - 1].value === '' && p[p.length - 1].column === 'tone', p.slice(-1));
  await ctrlZ();
  check('Ctrl+Z restores neutral', (await val(0, 'tone')) === 'neutral', await snap());
  await press('ArrowRight');
  await press('ArrowDown');
  await press('Delete');
  check('Delete clears a free-text cell too', (await val(1, 'topic')) === '', await snap());

  // 8. Delete on a read-only data cell does nothing
  const firstData = data.columns[1] ? data.columns[1].field : data.columns[0].field;
  const dataBefore = await val(3, firstData);
  await click(3, firstData);
  await press('Delete');
  check('Delete on a data cell changes nothing', (await val(3, firstData)) === dataBefore, { firstData });

  // 9. Double-click opens the whole list; a click on an option commits it
  await click(4, 'tone', 2);
  s = await snap();
  check('double-click opens the whole list', s.editing.join() === '4:tone' && s.options.length === 4, s);
  const opt = await ev(`(function(){var o=[].filter.call(document.querySelectorAll('.aura-code-list [role=option]'),function(x){return x.textContent==='positive';})[0];var r=o.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: opt.x, y: opt.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: opt.x, y: opt.y, button: 'left', clickCount: 1 });
  await sleep(250);
  check('clicking positive in the list commits it', (await val(4, 'tone')) === 'positive' && (await snap()).editing.length === 0, await snap());

  // 10. Enter on a cell that is not being edited moves down (spreadsheet), F2 then Escape changes nothing
  await click(6, 'tone');
  await press('Enter');
  s = await snap();
  check('Enter (not editing) moves down without opening an editor', s.focus.row === 7 && s.editing.length === 0, s);
  await shot('6-final');

  ws.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} checks pass`);
  return failed.length === 0;
}

function cleanup() { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
main().then((ok) => { cleanup(); process.exit(ok ? 0 : 1); }).catch((e) => { console.error('keys test failed:', e.message); cleanup(); process.exit(1); });
