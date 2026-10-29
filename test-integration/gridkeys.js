// The coding sheet's spreadsheet keys (0.4.1, #rgui), in a real VS Code, run by
// scripts/integration.mjs with AURA_IT_SUITE=test-integration/gridkeys.js and AURA_IT_CDP_PORT set.
//
// Opens the practice tweets CSV in the data viewer, adds a code list column (tone: positive,
// neutral, negative) and a free-text column (topic) through the extension's own prompts, clicks
// the first tone cell with a real mouse event, then codes from the keyboard with real key events
// (DevTools Input.dispatchKeyEvent on this test window only, which the browser routes to the
// focused webview as trusted events, as a keyboard's are): typeahead, Enter, Tab, Shift+Tab, a
// letter that matches no code, Escape, F2 and the arrows, Delete, and Ctrl+Z. It reads the codes
// file the extension wrote, and reads the accessibility tree (what a screen reader is given) for
// the open editor, the chosen option, the status line, and a committed cell. CDP screenshots of
// the test window go to AURA_IT_SHOTS.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function choose(down) {
  await sleep(1500);
  for (let i = 0; i < down; i++) {
    await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext');
    await sleep(120);
  }
  await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
}

// ---------- DevTools protocol ----------
async function cdpTargets() {
  const res = await fetch(`http://127.0.0.1:${process.env.AURA_IT_CDP_PORT}/json/list`);
  return res.json();
}

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error('websocket error ' + (e && e.message)));
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && this.pending.has(msg.id)) {
          this.pending.get(msg.id)(msg);
          this.pending.delete(msg.id);
        }
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text + ' ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) };
    return r.result && r.result.result ? r.result.result.value : r;
  }
  /** The accessibility node of the element an expression returns (role, name, states). */
  async ax(expr) {
    await this.send('Accessibility.enable');
    const r = await this.send('Runtime.evaluate', { expression: expr });
    const objectId = r.result && r.result.result && r.result.result.objectId;
    if (!objectId) return null;
    const t = await this.send('Accessibility.getPartialAXTree', { objectId, fetchRelatives: false });
    const n = t.result && t.result.nodes && t.result.nodes[0];
    if (!n) return null;
    const props = {};
    for (const p of n.properties || []) props[p.name] = p.value && p.value.value;
    return { role: n.role && n.role.value, name: n.name && n.name.value, value: n.value && n.value.value, ...props };
  }
  close() { try { this.ws.close(); } catch (_) { /* closing */ } }
}

const VDOC = `(function () {
  var f = document.getElementById('active-frame');
  var d = f ? f.contentDocument : document;
  return d && d.getElementById('btn-rebuild') ? d : null;
})()`;
const VWIN = `${VDOC}.defaultView`;

async function findTarget(test, log, what) {
  for (let i = 0; i < 30; i++) {
    for (const t of await cdpTargets()) {
      const c = new Cdp(t.webSocketDebuggerUrl);
      try {
        await c.open();
        if ((await c.eval(test)) === true) return c;
      } catch (_) { /* next */ }
      c.close();
    }
    await sleep(1000);
  }
  log(`${what} target`, 'not found');
  return null;
}

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  Delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
  F2: { key: 'F2', code: 'F2', windowsVirtualKeyCode: 113 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
};
const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

async function run() {
  const out = { steps: [], checks: [] };
  const log = (name, value) => out.steps.push({ name, value });
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, ...(ok ? {} : { detail }) });
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const shots = process.env.AURA_IT_SHOTS;
  try {
    const ext = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await ext.activate();
    log('version', ext.packageJSON.version);

    const src = 'O:\\10-teaching\\2026_Fall\\MC427\\modules\\mod05\\mod05-E01-practice-tweets.csv';
    fs.mkdirSync(path.join(ws, 'data'), { recursive: true });
    const csv = path.join(ws, 'data', 'practice-tweets.csv');
    fs.copyFileSync(src, csv);
    const before = fs.readFileSync(csv);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(csv), vscode.ViewColumn.One);
    const v = vscode.commands.executeCommand('auraR.openDataViewer');
    await choose(0); // The CSV open in the editor
    await v;
    await sleep(4000);
    await vscode.commands.executeCommand('workbench.action.closeEditorsInOtherGroups');
    const viewer = await findTarget(`!!${VDOC}`, log, 'viewer webview');
    const wb = await findTarget(`!!document.querySelector('.monaco-workbench')`, log, 'workbench');
    if (!viewer || !wb) throw new Error('no viewer or workbench target');

    let shotN = 0;
    const shot = async (label) => {
      if (!shots) return;
      const r = await wb.send('Page.captureScreenshot', { format: 'png' });
      const name = `gridkeys-${String(++shotN).padStart(2, '0')}-${label}.png`;
      fs.writeFileSync(path.join(shots, name), Buffer.from(r.result.data, 'base64'));
      log('shot', name);
    };
    const press = async (name, mods = []) => {
      const k = KEYS[name];
      const modifiers = mods.reduce((a, m) => a | MOD[m], 0);
      await wb.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', modifiers, ...k });
      await wb.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...k, text: undefined });
      await sleep(250);
    };
    const type = async (s) => {
      for (const ch of s) {
        const upper = ch !== ch.toLowerCase();
        const code = /[a-z]/i.test(ch) ? 'Key' + ch.toUpperCase() : ch === ' ' ? 'Space' : '';
        const vk = ch === ' ' ? 32 : ch.toUpperCase().charCodeAt(0);
        const modifiers = upper ? MOD.shift : 0;
        await wb.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, windowsVirtualKeyCode: vk, text: ch, unmodifiedText: ch.toLowerCase(), modifiers });
        await wb.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk, modifiers });
        await sleep(150);
      }
      await sleep(150);
    };
    const ctrl = async (letter) => {
      const k = { key: letter, code: 'Key' + letter.toUpperCase(), windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0) };
      await wb.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: MOD.ctrl, ...k });
      await wb.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: MOD.ctrl, ...k });
      await sleep(400);
    };
    const snap = () => viewer.eval(`(function(){var d=${VDOC};var a=d.defaultView.__auraApi;var f=a.getFocusedCell();var inp=d.querySelector('.aura-code-input');var act=inp&&inp.getAttribute('aria-activedescendant');var actEl=act&&d.getElementById(act);return {focus:f?{row:f.rowIndex,col:f.column.getColId()}:null,editing:a.getEditingCells().map(function(c){return c.rowIndex+':'+c.column.getColId();}),input:inp?inp.value:null,active:actEl?actEl.textContent:null,options:[].map.call(d.querySelectorAll('.aura-code-list [role=option]'),function(o){return o.textContent;}),live:(d.querySelector('.aura-code-editor .aura-sr-only')||{}).textContent||null,status:d.getElementById('aura-status').textContent,hint:d.getElementById('aura-help').textContent.replace(/\\s+/g,' ').trim()};})()`);
    const val = (row, col) => viewer.eval(`${VWIN}.__auraApi.getDisplayedRowAtIndex(${row}).data['${col}'] || ''`);

    // Add the two coding columns through the extension's prompts (text typed into this window only)
    const typeIntoInput = async (text) => {
      await sleep(1200);
      await wb.send('Input.insertText', { text });
      await sleep(300);
      await press('Enter');
    };
    await viewer.eval(`${VDOC}.getElementById('btn-add').click()`);
    await typeIntoInput('tone');
    await choose(0); // Allowed values (a dropdown)
    await typeIntoInput('positive, neutral, negative');
    await choose(0); // Code it once
    await sleep(1500);
    const addedStatus = (await snap()).status;
    check('status after adding tone names the real keys', /type the first letters of a code, then press Enter/.test(addedStatus), addedStatus);
    await viewer.eval(`${VDOC}.getElementById('btn-add').click()`);
    await typeIntoInput('topic');
    await choose(1); // Free text
    await choose(0); // Code it once
    await sleep(1500);
    log('coding columns', await viewer.eval(`${VWIN}.__auraApi.getColumnDefs().map(function(c){return c.field;}).slice(-2)`));
    const hint = (await snap()).hint;
    check('the in-viewer hint names typeahead, Enter, Tab, Escape, F2, and Delete', /type the first letters of a code and press Enter/.test(hint) && /Tab/.test(hint) && /F2/.test(hint) && /Delete clears/.test(hint), hint);

    // A real mouse click on row 1's tone cell: workbench iframe + webview frame + cell offsets
    await viewer.eval(`(function(){var a=${VWIN}.__auraApi;a.ensureColumnVisible('tone');a.ensureIndexVisible(0);})()`);
    await sleep(600);
    const inner = await viewer.eval(`(function(){var f=document.getElementById('active-frame');var fr=f?f.getBoundingClientRect():{x:0,y:0};var c=${VDOC}.querySelector('.ag-row[row-index="0"] [role=gridcell][col-id="tone"]');var r=c.getBoundingClientRect();return {x:fr.x+r.x+r.width/2,y:fr.y+r.y+r.height/2};})()`);
    const outer = await wb.eval(`(function(){var best=null;[].forEach.call(document.querySelectorAll('iframe'),function(f){var r=f.getBoundingClientRect();if(/webview/.test(f.className+f.src)&&r.width*r.height>0&&(!best||r.width*r.height>best.w*best.h))best={x:r.x,y:r.y,w:r.width,h:r.height};});return best;})()`);
    const pt = { x: outer.x + inner.x, y: outer.y + inner.y };
    log('click point', { outer, inner, pt });
    await wb.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await wb.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(500);
    let s = await snap();
    check('a real click focuses row 1 tone', s.focus && s.focus.row === 0 && s.focus.col === 'tone', s);
    await shot('clicked-row1-tone');

    // Typeahead, then Enter
    await type('n');
    s = await snap();
    check('typing n opens the code list filtered to neutral and negative, neutral chosen, one n typed', s.editing.join() === '0:tone' && s.input === 'n' && s.options.join() === 'neutral,negative' && s.active === 'neutral', s);
    await shot('typed-n');
    const comboAx = await viewer.ax(`${VDOC}.activeElement`);
    check('screen reader: focus is a combobox named for the column and row', comboAx && comboAx.role === 'combobox' && /^tone, row 1/.test(comboAx.name), comboAx);
    const optAx = await viewer.ax(`(function(){var d=${VDOC};return d.getElementById(d.activeElement.getAttribute('aria-activedescendant'));})()`);
    check('screen reader: the active option is "neutral", selected', optAx && optAx.role === 'option' && optAx.name === 'neutral' && optAx.selected === true, optAx);
    const liveAx = await viewer.ax(`${VDOC}.querySelector('.aura-code-editor .aura-sr-only')`);
    log('editor live region (AX)', liveAx);
    check('screen reader: the editor live region is polite and says the choice', liveAx && liveAx.live === 'polite' && /neutral, 1 of 2/.test(s.live), { liveAx, live: s.live });
    await type('eg');
    s = await snap();
    check('typing "neg" narrows to negative', s.options.join() === 'negative' && s.active === 'negative', s);
    await press('Enter');
    await sleep(300);
    s = await snap();
    check('Enter commits negative and moves down a row', (await val(0, 'tone')) === 'negative' && s.focus.row === 1 && s.focus.col === 'tone' && s.editing.length === 0, s);
    await sleep(1200);
    const statusAx = await viewer.ax(`${VDOC}.getElementById('aura-status')`);
    log('status (AX)', statusAx);
    check('screen reader: the status line is a polite live region naming the code entered and the save', statusAx && statusAx.role === 'status' && statusAx.live === 'polite' && /tone, row 1: negative\./.test((await snap()).status) && /Saved/.test((await snap()).status), { statusAx, status: (await snap()).status });
    const cellAx = await viewer.ax(`${VDOC}.querySelector('.ag-row[row-index="0"] [role=gridcell][col-id="tone"]')`);
    check('screen reader: the committed cell reads "negative"', cellAx && cellAx.role === 'gridcell' && /negative/.test(cellAx.name || ''), cellAx);
    await shot('committed-negative');

    // Case-insensitive typeahead, then Tab
    await type('P');
    await press('Tab');
    s = await snap();
    check('capital P picks positive; Tab commits and moves right to topic', (await val(1, 'tone')) === 'positive' && s.focus.row === 1 && s.focus.col === 'topic' && s.editing.length === 0, s);

    // Free text
    await type('game play');
    s = await snap();
    check('free text: typing opens the text editor', s.editing.join() === '1:topic', s);
    await shot('free-text');
    await press('Enter');
    s = await snap();
    check('free text: Enter commits "game play" and moves down', (await val(1, 'topic')) === 'game play' && s.focus.row === 2 && s.focus.col === 'topic', s);
    await press('Tab', ['shift']);
    s = await snap();
    check('Shift+Tab moves left to tone', s.focus.row === 2 && s.focus.col === 'tone', s);

    // A letter that matches no code
    await type('x');
    await press('Enter');
    s = await snap();
    check('x then Enter: stays in the editor, says no code starts with "x"', s.editing.join() === '2:tone' && /No code starts with "x"/.test(s.options.join()) && /Backspace to change the letters/.test(s.live || ''), s);
    await shot('no-match');
    await press('Escape');
    s = await snap();
    check('Escape keeps the cell blank and the focus on it', (await val(2, 'tone')) === '' && s.editing.length === 0 && s.focus.row === 2, s);

    // F2: the whole list on the current code; arrows choose; Enter commits
    await press('ArrowUp');
    await press('ArrowUp');
    await press('F2');
    s = await snap();
    check('F2 on row 1 opens the whole list with negative chosen', s.editing.join() === '0:tone' && s.options.length === 4 && s.active === 'negative', s);
    await shot('f2-whole-list');
    await press('ArrowUp');
    await press('Enter');
    s = await snap();
    check('Up then Enter commits neutral and moves down', (await val(0, 'tone')) === 'neutral' && s.focus.row === 1, s);

    // Typeahead then Backspace to blank, Escape cancels
    await type('p');
    await press('Backspace');
    s = await snap();
    check('Backspace takes the letter back: blank chosen, whole list', s.input === '' && /^\(blank/.test(s.active || ''), s);
    await press('Escape');
    check('Escape cancels: row 2 keeps positive', (await val(1, 'tone')) === 'positive', await snap());

    // Delete, then Ctrl+Z
    await press('ArrowUp');
    await press('Delete');
    s = await snap();
    check('Delete clears row 1 tone', (await val(0, 'tone')) === '' && s.editing.length === 0 && s.focus.row === 0, s);
    await ctrl('z');
    s = await snap();
    check('Ctrl+Z in the webview restores neutral', (await val(0, 'tone')) === 'neutral', s);

    // What reached the codes file
    await sleep(2500);
    const codes = path.join(ws, 'data', 'derived', 'practice-tweets-codes.csv');
    const lines = fs.existsSync(codes) ? fs.readFileSync(codes, 'utf8').trim().split(/\r?\n/) : [];
    log('codes file', lines);
    const has = (re) => lines.some((l) => re.test(l));
    check('codes file: T001 tone neutral, T002 tone positive, T002 topic game play, nothing for T003',
      has(/^T001,tone,neutral,/) && has(/^T002,tone,positive,/) && has(/^T002,topic,game play,/) && !lines.some((l) => /^T003,/.test(l)), lines);
    check('original CSV unchanged', Buffer.compare(before, fs.readFileSync(csv)) === 0);
    await shot('final');
    viewer.close();
    wb.close();
  } catch (e) {
    log('ERROR', String(e && e.stack || e));
  }
  out.passed = out.checks.filter((c) => c.ok).length;
  out.total = out.checks.length;
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
