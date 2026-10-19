// The Phase 2 suite (0.5.0, #rgui), run inside a real VS Code by scripts/integration.mjs with
// AURA_IT_SUITE=test-integration/p2.js and AURA_IT_CDP_PORT set.
//
// 1. Charts open in a tab: MC 451, one analysis.R. Write R code inserts the corpus load, the saved
//    analysis load, the line chart over time, and the grouped histogram, each run in the R terminal
//    through the "Run it" button. After each chart runs, the PNG it ggsave()d must be open as the
//    active tab of the active editor group, and that file must have been written by this run.
// 2. The menus: MC 451 offers the line chart and the grouped histogram but not the power analysis;
//    MC 501 offers all three.
// 3. Explain an R error: five messages a student meets (object not found, column not found, the
//    '\U' Windows path, = for ==, Permission denied (publickey)) through the command API, and two
//    of them through the real input box and quick pick, opened on a selection in the editor so the
//    clipboard is never read or written. Every link the matched entries carry is fetched and its
//    #anchor looked for on the page.
//
// The R messages are the exact text R 4.5.2 and dplyr print (reproduced on Pythia 2026-10-19).
// Menus and notifications are answered through VS Code's own commands; the one keypress (Enter in
// the input box) goes to this test window only, as a DevTools Input event, never the desktop.
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shotN = 0;

async function shot(label, out) {
  const dir = process.env.AURA_IT_SHOTS;
  if (!dir) return;
  shotN++;
  await sleep(2000);
  fs.writeFileSync(path.join(dir, `shot-${shotN}.want`), '');
  for (let i = 0; i < 60 && !fs.existsSync(path.join(dir, `shot-${shotN}.done`)); i++) await sleep(500);
  out.shots.push({ n: shotN, label });
}

/** Answer the open quick pick: move down `down` items, then accept. */
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

let RSCRIPT = 'Rscript';

function runR(ws, code, name) {
  const file = path.join(ws, `.p2-${name}.R`);
  fs.writeFileSync(file, code);
  const r = cp.spawnSync(RSCRIPT, ['--vanilla', '-e', `options(width = 120); source("${path.basename(file)}", echo = TRUE, print.eval = TRUE, max.deparse.length = Inf)`], {
    cwd: ws, env: process.env, encoding: 'utf8', timeout: 300000, windowsHide: true,
  });
  fs.rmSync(file, { force: true });
  return `${r.stdout ?? ''}\n${r.stderr ?? ''}`.replace(/\r\n/g, '\n');
}

// ---------- DevTools protocol, for the Enter key in the input box ----------
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

async function pressEnter(wb) {
  await wb.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await wb.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
}

/** The quick pick's visible rows, read from the workbench DOM. */
const QUICK_ROWS = `Array.from(document.querySelectorAll('.quick-input-widget .monaco-list-row')).map(function (r) { return r.innerText.replace(/\\s+/g, ' ').trim(); })`;

/** Where a PNG tab is, and whether it is the one in front. */
function pngTab(name) {
  const active = vscode.window.tabGroups.activeTabGroup;
  for (const g of vscode.window.tabGroups.all) {
    for (const t of g.tabs) {
      const uri = t.input && t.input.uri;
      if (uri && uri.fsPath.endsWith(name)) {
        return {
          label: t.label,
          viewColumn: g.viewColumn,
          isActiveTab: t.isActive,
          inActiveGroup: g === active,
          inFront: t.isActive && g === active,
          viewType: t.input.viewType || null,
        };
      }
    }
  }
  return null;
}

const MESSAGES = {
  'object-not-found': "Error: object 'chat_dta' not found",
  'column-not-found': "Error in `select()`:\n! Can't select columns that don't exist.\n✖ Column `viewer_count` doesn't exist.",
  'backslash-U': "Error: '\\U' used without hex digits in character string (<input>:1:22)",
  'named-input-equals': "Error in `filter()`:\n! We detected a named input.\nℹ This usually means that you've used `=` instead of `==`.\nℹ Did you mean `a == 1`?",
  'permission-denied-publickey': 'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.',
};

async function run() {
  const out = { steps: [], shots: [] };
  const log = (name, value) => out.steps.push({ name, value });
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  try {
    const ext = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await ext.activate();
    const { menuTasks } = require(path.join(ext.extensionPath, 'out', 'src', 'menus.js'));
    const { ERROR_TABLE } = require(path.join(ext.extensionPath, 'out', 'src', 'errors.js'));
    log('version', ext.packageJSON.version);
    log('extension path', ext.extensionPath);
    const diag = await vscode.commands.executeCommand('auraR.diagnostics');
    RSCRIPT = (diag && diag.r && diag.r[0] && diag.r[0].rscript) || 'Rscript';
    log('Rscript', RSCRIPT);
    log('R library', runR(ws, 'for (p in c("v2v", "pwr", "lm.beta", "effectsize")) cat(p, as.character(packageVersion(p)), "\\n")', 'lib').split('\n').filter((l) => /^(v2v|pwr|lm\.beta|effectsize) /.test(l)));

    // The saved analysis the MC 451 menus read, built as the R2 menus build it
    const golden = path.join(__dirname, '..', 'golden', 'fixtures', 'v2v', '_setup-build-analysis.R');
    runR(ws, fs.readFileSync(golden, 'utf8'), 'build');
    log('0 analysis RDS built', fs.existsSync(path.join(ws, 'data', 'twitch_analysis.RDS')));

    // 2. The menus, by course
    const m451 = menuTasks('mc451', true);
    const m501 = menuTasks('mc501', true);
    const m427 = menuTasks('mc427', true);
    log('2 MC 451 offers line, histogram-grouped, power', ['line', 'histogram-grouped', 'power'].map((t) => m451.includes(t)));
    log('2 MC 501 offers line, histogram-grouped, power', ['line', 'histogram-grouped', 'power'].map((t) => m501.includes(t)));
    log('2 MC 427 offers line, histogram-grouped, power', ['line', 'histogram-grouped', 'power'].map((t) => m427.includes(t)));

    // 1. Charts open in a tab, MC 451
    const pick451 = vscode.commands.executeCommand('auraR.pickCourse');
    await choose(1);
    log('1 pick returned', (await pick451) ?? null);
    const analysisR = path.join(ws, 'analysis.R');
    fs.writeFileSync(analysisR, '# Phase 2 chart check\n\n');
    let editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(analysisR), vscode.ViewColumn.One);
    async function write(task, wait) {
      editor = await vscode.window.showTextDocument(editor.document, vscode.ViewColumn.One);
      const last = editor.document.lineCount;
      editor.selection = new vscode.Selection(last, 0, last, 0);
      const p = vscode.commands.executeCommand('auraR.writeCode');
      await choose(m451.indexOf(task));
      await acceptToast(); // Run it
      await p;
      await sleep(wait);
    }
    await write('import-course-dataset', 25000);
    await write('import-rds', 8000);
    log('1 terminals', vscode.window.terminals.map((t) => t.name));

    const figs = path.join(ws, 'figures');
    const charts = [
      { task: 'line', png: 'viewers-over-time-line.png' },
      { task: 'histogram-grouped', png: 'message-length-grouped-histogram.png' },
    ];
    for (const c of charts) {
      const started = Date.now();
      await write(c.task, 0);
      // revealSavedChart waits up to 12 s for the file after the block is sent
      let tab = null;
      for (let i = 0; i < 40 && !(tab = pngTab(c.png)); i++) await sleep(500);
      const file = path.join(figs, c.png);
      const st = fs.existsSync(file) ? fs.statSync(file) : null;
      log(`1 ${c.task}: PNG tab`, tab);
      log(`1 ${c.task}: PNG written by this run`, st ? { bytes: st.size, newerThanRun: st.mtimeMs >= started - 1000 } : 'missing');
      log(`1 ${c.task}: active editor tab`, vscode.window.tabGroups.activeTabGroup.activeTab && vscode.window.tabGroups.activeTabGroup.activeTab.label);
      await shot(`${c.task} chart saved and opened in a tab beside analysis.R`, out);
    }
    log('1 inserted banners', editor.document.getText().split(/\r?\n/).filter((l) => l.startsWith('# ---- ')));

    // A stale PNG is never shown: re-open analysis.R, write the line chart again but answer the
    // Run prompt with nothing, and check no new tab took the front
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(analysisR), vscode.ViewColumn.One);
    const lastLine = editor.document.lineCount;
    editor.selection = new vscode.Selection(lastLine, 0, lastLine, 0);
    const pNoRun = vscode.commands.executeCommand('auraR.writeCode');
    await choose(m451.indexOf('line'));
    await sleep(1500);
    await vscode.commands.executeCommand('notifications.clearAll');
    await pNoRun;
    await sleep(4000);
    log('1 not run: PNG tab opened anyway', pngTab('viewers-over-time-line.png'));

    // 3. Explain an R error
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const api = {};
    for (const [want, msg] of Object.entries(MESSAGES)) {
      api[want] = await vscode.commands.executeCommand('auraR.explainError', msg);
    }
    log('3 command API: matched ids per message', api);
    log('3 command API: each message finds its entry', Object.entries(api).map(([want, ids]) => `${want}: ${ids.includes(want) ? 'yes' : 'NO'}`));

    // The real input box and quick pick, on a selection
    const wb = await workbenchTarget();
    const ui = {};
    for (const want of ['backslash-U', 'permission-denied-publickey']) {
      const f = path.join(ws, `${want}.txt`);
      fs.writeFileSync(f, MESSAGES[want]);
      const ed = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(f), vscode.ViewColumn.One);
      ed.selection = new vscode.Selection(0, 0, ed.document.lineCount, 0);
      const p = vscode.commands.executeCommand('auraR.explainError');
      await sleep(2000);
      const prefilled = wb ? await wb.eval(`(document.querySelector('.quick-input-widget input') || {}).value`) : null;
      if (wb) await pressEnter(wb);
      await sleep(2000);
      const rows = wb ? await wb.eval(QUICK_ROWS) : null;
      const title = wb ? await wb.eval(`(document.querySelector('.quick-input-widget .quick-input-title') || {}).innerText`) : null;
      ui[want] = { prefilledFromSelection: prefilled === MESSAGES[want].replace(/\n$/, ''), title, rows };
      await shot(`Explain an R error: ${want} in the quick pick`, out);
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
      ui[want].returned = await p;
    }
    log('3 UI path', ui);
    if (wb) wb.close();

    // Every link the matched entries carry: HTTP 200 and the #anchor present on the page
    const linkIds = [...new Set(Object.values(api).flat())];
    const links = [];
    for (const id of linkIds) {
      const e = ERROR_TABLE.find((x) => x.id === id);
      if (!e.link) { links.push({ id, link: null }); continue; }
      const [base, frag] = e.link.url.split('#');
      try {
        const r = await fetch(base);
        const body = await r.text();
        links.push({ id, label: e.link.label, url: e.link.url, status: r.status, anchor: frag ? body.includes(`id="${frag}"`) : null });
      } catch (err) {
        links.push({ id, url: e.link.url, error: String(err && err.message) });
      }
    }
    log('3 links of the matched entries', links);
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
