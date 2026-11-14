// The 0.5.3 import suite (#rgui Rank 2), run inside a real VS Code by scripts/integration.mjs with
// AURA_IT_SUITE=test-integration/import.js and AURA_IT_CDP_PORT set.
//
// MC 451, one analysis.R, the golden two-sheet workbook copied into data/. Import a data file is
// started with the file and table name given (the OS file dialog cannot be driven from a suite);
// every later step is the real one: the sheet pick (sheet 2, "Coder notes"), the peek (its title
// and rows read from the workbench DOM), the block at the cursor, Run it in the R terminal, and
// the table checked inside that R session. Then the same import is cancelled at the peek and must
// write nothing, and the data viewer opens the same sheet through the R bridge with its row count.
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

async function acceptToast() {
  await sleep(1500);
  await vscode.commands.executeCommand('notification.acceptPrimaryAction');
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
        if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); }
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
    return r.result && r.result.result ? r.result.result.value : r;
  }
  close() { try { this.ws.close(); } catch (_) { /* closing */ } }
}

async function workbenchTarget() {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`http://127.0.0.1:${process.env.AURA_IT_CDP_PORT}/json/list`);
    for (const t of await res.json()) {
      const c = new Cdp(t.webSocketDebuggerUrl);
      try {
        await c.open();
        if ((await c.eval(`!!document.querySelector('.monaco-workbench')`)) === true) return c;
      } catch (_) { /* next */ }
      c.close();
    }
    await sleep(1000);
  }
  return null;
}

const QUICK = `({
  title: (document.querySelector('.quick-input-widget .quick-input-title') || {}).innerText || '',
  rows: Array.from(document.querySelectorAll('.quick-input-widget .monaco-list-row')).map(function (r) { return r.innerText.replace(/\\s+/g, ' ').trim(); })
})`;

const STATE = `(function () {
  var w = document.querySelector('.quick-input-widget');
  var a = document.activeElement;
  return {
    quickVisible: !!w && w.style.display !== 'none' && w.offsetParent !== null,
    quickTitle: w ? ((w.querySelector('.quick-input-title') || {}).innerText || '') : '',
    focused: a ? (a.tagName + '.' + String(a.className || '').split(' ').slice(0, 3).join('.') + ' ' + (a.getAttribute('aria-label') || '')).slice(0, 160) : '',
    hasFocus: document.hasFocus(),
    toasts: Array.from(document.querySelectorAll('.notification-toast .notification-list-item-message')).map(function (e) { return e.innerText.slice(0, 120); }),
    dialog: !!document.querySelector('.monaco-dialog-box')
  };
})()`;

async function waitFor(check, ms, step = 500) {
  for (let t = 0; t < ms; t += step) {
    const v = check();
    if (v) return v;
    await sleep(step);
  }
  return check();
}

async function run() {
  const out = { steps: [] };
  // Written after every step, so a stalled run still shows how far it got
  const log = (name, value) => {
    out.steps.push({ name, value: value === undefined ? null : value });
    fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
  };
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  let wb = null;
  try {
    const ext = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await ext.activate();
    log('version', ext.packageJSON.version);
    wb = await workbenchTarget();
    log('DevTools target', !!wb);

    fs.mkdirSync(path.join(ws, 'data'), { recursive: true });
    const xlsx = path.join(ws, 'data', 'coded-pilot.xlsx');
    fs.copyFileSync(path.join(__dirname, '..', 'golden', 'data-map', 'coded-pilot.xlsx'), xlsx);

    // AURA_IT_TRACE=1 records what is on screen around the course pick (stall diagnosis, 2026-11-14)
    const trace = [];
    const t0 = Date.now();
    const traceSnap = async (tag) => {
      if (process.env.AURA_IT_TRACE !== '1' || !wb) return;
      trace.push({ tag, ms: Date.now() - t0, screen: await wb.eval(STATE),
        tabs: vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label)),
        terminals: vscode.window.terminals.map((t) => t.name) });
      log('trace', trace);
    };
    // The first-run Get Started walkthrough opens on activation and moves focus to its first step
    // about 300 ms later; a QuickPick closes when it loses focus, so the course pick came back
    // undefined and every later pick shifted by one (the stall, traced 2026-11-14). Close it and let
    // focus settle before picking. AURA_IT_KEEP_WELCOME=1 keeps the old order (the toggle).
    if (process.env.AURA_IT_KEEP_WELCOME !== '1') {
      await waitFor(() => vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => /Welcome|Walkthrough/.test(t.label))), 5000, 250);
      await sleep(1500);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await sleep(1000);
    }
    await traceSnap('before pick');
    const pick = vscode.commands.executeCommand('auraR.pickCourse');
    // Wait until the course picker is on screen: a fixed wait let the keys land before it opened in
    // 2 of 3 runs on 2026-10-23, and the picker then sat over every later step
    for (let t = 0; wb && t < 20000; t += 250) {
      const s = await wb.eval(STATE);
      if (s && s.quickVisible && /Which course/.test(s.quickTitle)) break;
      await sleep(250);
    }
    await traceSnap('picker seen');
    for (let i = 0; i < 6; i++) { await sleep(250); await traceSnap('wait ' + i); }
    await choose(1);
    await traceSnap('after accept');
    log('course', (await pick) ?? null);

    const analysisR = path.join(ws, 'analysis.R');
    fs.writeFileSync(analysisR, '# Import check\n\n');
    let editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(analysisR), vscode.ViewColumn.One);
    editor.selection = new vscode.Selection(2, 0, 2, 0);

    // 1. Import sheet 2 of the workbook as notes
    const imp = vscode.commands.executeCommand('auraR.importDataFile', { file: xlsx, name: 'notes' });
    await sleep(6000); // R lists the sheets
    log('1 sheet pick', wb ? await wb.eval(QUICK) : null);
    await choose(1); // Coder notes
    await sleep(6000); // the column probe
    log('1 peek', wb ? await wb.eval(QUICK) : null);
    await choose(0); // Write the code that loads this table
    await acceptToast(); // Run it
    await imp;
    const text = editor.document.getText();
    log('1 block in analysis.R', {
      readxl: text.includes('notes <- readxl::read_excel("data/coded-pilot.xlsx", sheet = "Coder notes") %>%'),
      cleanNames: text.includes('  janitor::clean_names()'),
      scipen: text.includes('options(scipen = 10)'),
      glimpse: text.includes('glimpse(notes)'),
      untitled: vscode.workspace.textDocuments.filter((d) => d.isUntitled).length,
    });

    // The table inside the R session the block ran in
    const term = await waitFor(() => vscode.window.terminals.find((t) => t.name === 'R (AURA)' || t.name === 'R Interactive' || t.name === 'R'), 30000);
    log('1 terminal', term ? term.name : null);
    const answer = path.join(ws, 'session-check.txt').replace(/\\/g, '/');
    await sleep(15000); // the tidyverse loads
    term.sendText(`writeLines(c(nrow(notes), names(notes)), "${answer}")`);
    const got = await waitFor(() => fs.existsSync(answer) && fs.readFileSync(answer, 'utf8').trim(), 30000);
    log('1 notes in the R session (rows, names)', got ? got.split(/\r?\n/) : null);

    // 2. Esc at the peek writes nothing
    const before = editor.document.getText();
    const imp2 = vscode.commands.executeCommand('auraR.importDataFile', { file: xlsx, name: 'notes_again' });
    await sleep(6000);
    await choose(0); // Sheet1
    await sleep(6000);
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    await imp2;
    log('2 Esc at the peek: script unchanged', editor.document.getText() === before);

    // 3. The data viewer opens the same sheet through the R bridge
    const v = vscode.commands.executeCommand('auraR.openDataViewer', xlsx);
    await sleep(6000);
    await choose(1); // Coder notes
    await v;
    const snap = path.join(ws, 'data', 'derived', 'coded_pilot_coder_notes-source.csv');
    const snapText = await waitFor(() => fs.existsSync(snap) && fs.readFileSync(snap, 'utf8'), 30000);
    log('3 viewer snapshot', snapText ? { file: path.basename(snap), lines: snapText.trim().split(/\r?\n/) } : null);
    const tab = await waitFor(() => vscode.window.tabGroups.all.flatMap((g) => g.tabs).find((t) => /Data: /.test(t.label)), 20000);
    log('3 viewer tab', tab ? tab.label : vscode.window.tabGroups.all.flatMap((g) => g.tabs).map((t) => t.label));
  } catch (e) {
    out.error = String((e && e.stack) || e);
  } finally {
    if (wb) wb.close();
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
