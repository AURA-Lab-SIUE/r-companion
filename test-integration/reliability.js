// The 0.7.2 reliability suite: Reliability: compare two coding passes on the student's own data,
// run inside a real VS Code by scripts/integration.mjs with AURA_IT_SUITE=test-integration/reliability.js,
// AURA_IT_CDP_PORT set, and AURA_IT_PASSES naming a pilot-both-passes.csv (v2v-hub guide 07's example).
// 1. A table in my script offers the script's tables; the _p1/_p2 pairs come ticked; both blocks land.
// 2. A table with other column names goes straight to the two column picks.
// 3. The whole script runs in Rscript and prints the statistics.
const vscode = require('vscode');
const cp = require('child_process');
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
  placeholder: (document.querySelector('.quick-input-widget input') || {}).placeholder || '',
  rows: Array.from(document.querySelectorAll('.quick-input-widget .monaco-list-row')).map(function (r) { return r.innerText.replace(/\\s+/g, ' ').trim(); })
})`;
const TOASTS = `Array.from(document.querySelectorAll('.notification-list-item-message')).map(function (n) { return n.innerText; })`;

async function run() {
  const out = { steps: [] };
  const log = (name, value) => out.steps.push({ name, value });
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  let wb = null;
  try {
    const ext = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await ext.activate();
    const { menuTasks } = require(path.join(ext.extensionPath, 'out', 'src', 'menus.js'));
    log('version', ext.packageJSON.version);
    wb = await workbenchTarget();
    const diag = await vscode.commands.executeCommand('auraR.diagnostics');
    const rscript = (diag && diag.r && diag.r[0] && diag.r[0].rscript) || 'Rscript';

    const data = path.join(ws, 'data');
    fs.mkdirSync(data, { recursive: true });
    // Both passes side by side, as v2v-hub guide 07 makes them (20 rows: 3 threat and 2 focus disagreements)
    fs.copyFileSync(process.env.AURA_IT_PASSES, path.join(data, 'pilot-both-passes.csv'));
    // A sheet whose pass columns are not named _p1 and _p2, with a 19-digit id
    fs.writeFileSync(path.join(data, 'renamed.csv'), 'post_id,first_code,second_code\n1234567890123456789,a,a\n1234567890123456790,b,b\n1234567890123456791,a,b\n1234567890123456792,c,c\n1234567890123456793,b,b\n1234567890123456794,a,a\n');

    const pick = vscode.commands.executeCommand('auraR.pickCourse');
    await choose(1);
    log('course', (await pick) ?? null);

    const relR = path.join(ws, 'reliability.R');
    fs.writeFileSync(relR, [
      'library(tidyverse)',
      'both_passes <- read_csv("data/pilot-both-passes.csv")',
      'renamed <- read_csv("data/renamed.csv")',
      '',
      '',
    ].join('\n'));
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(relR), vscode.ViewColumn.One);
    const toEnd = () => {
      const last = editor.document.lineCount - 1;
      editor.selection = new vscode.Selection(last, 0, last, 0);
    };
    const index = menuTasks('mc451', true).indexOf('reliability');
    log('menu offers reliability', index >= 0);

    // 1. A table in my script, then the ticked _p1/_p2 pairs
    toEnd();
    let p = vscode.commands.executeCommand('auraR.writeCode');
    await choose(index);
    await sleep(1000);
    log('1 route pick', await wb.eval(QUICK));
    await choose(1); // A table in my script
    await sleep(1000);
    log('1 table pick', await wb.eval(QUICK));
    await choose(0); // both_passes
    await sleep(9000); // column probe
    log('1 pair pick', await wb.eval(QUICK));
    await choose(0); // accept the ticked pairs
    await sleep(1500);
    await vscode.commands.executeCommand('notifications.clearAll');
    await p;
    const t1 = editor.document.getText();
    log('1 blocks', ['threat_passes <- both_passes %>%', 'focus_passes <- both_passes %>%', 'select(threat_p1, threat_p2) %>%'].map((s) => t1.includes(s)));

    // 2. Two columns picked by hand, on a table with no _p1/_p2 names
    toEnd();
    p = vscode.commands.executeCommand('auraR.writeCode');
    await choose(index);
    await choose(1); // A table in my script
    await sleep(1000);
    await choose(1); // renamed
    await sleep(9000);
    log('2 first column pick', await wb.eval(QUICK));
    await choose(1); // first_code
    await sleep(1000);
    log('2 second column pick', await wb.eval(QUICK));
    await choose(1); // second_code (post_id, then second_code)
    await sleep(1500);
    await vscode.commands.executeCommand('notifications.clearAll');
    await p;
    const t2 = editor.document.getText();
    log('2 block', ['codes_passes <- renamed %>%', 'filter(!is.na(first_code), !is.na(second_code))'].map((s) => t2.includes(s)));

    // 3. The whole script runs in Rscript
    await editor.document.save();
    const r = cp.spawnSync(rscript, ['--vanilla', '-e', 'source("reliability.R", echo = TRUE, max.deparse.length = Inf)'], {
      cwd: ws, encoding: 'utf8', timeout: 180000, windowsHide: true,
    });
    const text = `${r.stdout}\n${r.stderr}`;
    log('3 Rscript exit', r.status);
    log('3 statistics', text.split('\n').filter((l) => /Kappa =|alpha =|share_agree|^1 +\d+ +[\d.]+$/.test(l)));
    log('3 errors', text.split('\n').filter((l) => /^Error/.test(l)));
  } catch (e) {
    out.error = String((e && e.stack) || e);
  } finally {
    if (wb) wb.close();
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
