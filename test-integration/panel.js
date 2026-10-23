// The 0.5.3 panel suite (#rgui Ranks 4, 5, and 6), run inside a real VS Code by
// scripts/integration.mjs with AURA_IT_SUITE=test-integration/panel.js, AURA_IT_CDP_PORT, and
// vscode-R preinstalled (AURA_IT_PREINSTALL_VSIX).
//
// 1. Before a course is picked the view shows its welcome text and the Pick my course button.
// 2. MC 451: the root nodes, read from the workbench DOM, are the six sections in order.
// 3. Keyboard only: Focus on R Companion View, arrow keys down to Data > Load the course Twitch
//    corpus, Enter: the block lands in analysis.R. Arrow and Enter go to this window only, as
//    DevTools key events, never the desktop.
// 4. The Your steps node lists the block's banner; the status line updates after Check my setup.
// 5. With no script open, Write R code goes to steps.R (made only now, never on activation), and
//    Run my steps from the top runs it in R: chat exists in that session afterwards.
// 6. Objects in R opens vscode-R's Workspace view.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function key(wb, name, code) {
  await wb.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code });
  await wb.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
  await sleep(150);
}

// The panel's rows and its welcome text, read from the view's DOM
const PANEL = `(function () {
  var pane = Array.from(document.querySelectorAll('.pane')).find(function (p) { return /R Companion/.test((p.querySelector('.pane-header') || {}).innerText || ''); });
  if (!pane) return null;
  return {
    welcome: ((pane.querySelector('.welcome-view-content') || {}).innerText || '').replace(/\\s+/g, ' ').trim(),
    rows: Array.from(pane.querySelectorAll('.monaco-list-row')).map(function (r) {
      return { label: r.getAttribute('aria-label'), level: r.getAttribute('aria-level'), role: r.getAttribute('role') };
    })
  };
})()`;
const FOCUSED_ROW = `(document.activeElement && document.activeElement.closest('.monaco-list') && (document.querySelector('.pane .monaco-list-row.focused') || {}).getAttribute) ? document.querySelector('.pane .monaco-list-row.focused').getAttribute('aria-label') : null`;

async function waitFor(check, ms, step = 500) {
  for (let t = 0; t < ms; t += step) {
    const v = await check();
    if (v) return v;
    await sleep(step);
  }
  return check();
}

async function run() {
  const out = { steps: [] };
  const log = (name, value) => out.steps.push({ name, value: value === undefined ? null : value });
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  let wb = null;
  try {
    const ext = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await ext.activate();
    log('version', ext.packageJSON.version);
    wb = await workbenchTarget();
    const steps = path.join(ws, 'steps.R');
    log('0 steps.R not made on activation', !fs.existsSync(steps));

    // 1
    await vscode.commands.executeCommand('auraR.panel.focus');
    await sleep(2000);
    log('1 before a course: the view', await wb.eval(PANEL));

    // 2
    // MC 451 is the second course in the list
    const p = vscode.commands.executeCommand('auraR.pickCourse');
    await sleep(1500);
    await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext');
    await sleep(150);
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    log('2 course', (await p) ?? null);
    await sleep(1500);
    const view = await wb.eval(PANEL);
    log('2 root rows', view && view.rows.filter((r) => r.level === '1').map((r) => r.label));
    log('2 Data rows', view && view.rows.filter((r) => r.level === '2').slice(6, 10).map((r) => r.label));
    log('2 role of a row', view && view.rows[0] && view.rows[0].role);

    // 3
    const analysisR = path.join(ws, 'analysis.R');
    fs.writeFileSync(analysisR, '# Panel check\n\n');
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(analysisR), vscode.ViewColumn.One);
    editor.selection = new vscode.Selection(2, 0, 2, 0);
    await vscode.commands.executeCommand('auraR.panel.focus');
    await sleep(1000);
    // Down until the focused row is the task, then Enter; never Enter on any other row (Import a
    // data file would open the system's file dialog)
    let focused = null;
    for (let i = 0; i < 20 && focused !== 'Load the course Twitch corpus'; i++) {
      await key(wb, 'ArrowDown', 40);
      focused = await wb.eval(FOCUSED_ROW);
    }
    log('3 focused row before Enter', focused);
    if (focused === 'Load the course Twitch corpus') await key(wb, 'Enter', 13);
    await sleep(2500);
    await vscode.commands.executeCommand('notifications.clearAll'); // Run it is not needed here
    log('3 block in analysis.R', editor.document.getText().includes('chat <- twitch_chat()'));

    // 4
    await vscode.window.showTextDocument(editor.document);
    await sleep(1500);
    const after = await wb.eval(PANEL);
    const roots = (await vscode.commands.executeCommand('auraR.diagnostics')).panel;
    const stepsNode = roots.find((r) => r.id === 'steps');
    log('4 Your steps (tree model)', stepsNode.children.map((c) => [c.label, c.description || null]));
    log('4 Your steps rows in the DOM', after && after.rows.filter((r) => /Load the tidyverse|Open my steps|Run my steps/.test(r.label || '')).map((r) => r.label));
    await vscode.commands.executeCommand('auraR.checkSetup', { course: 'mc451', silent: true });
    await sleep(1500);
    const st = await wb.eval(PANEL);
    log('4 status line after Check my setup', st && st.rows.map((r) => r.label).find((l) => /^MC 451, R /.test(l || '')));
    log('4 all rows now', st && st.rows.map((r) => `${r.level}:${r.label}`));

    // 5
    await editor.document.save();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(1000);
    log('5 active editor before', vscode.window.activeTextEditor ? path.basename(vscode.window.activeTextEditor.document.fileName) : null);
    // The editor memory keeps analysis.R while it is open; closing every editor leaves none to write into
    const w = vscode.commands.executeCommand('auraR.writeCode', 'import-course-dataset');
    await sleep(2500);
    await vscode.commands.executeCommand('notifications.clearAll');
    await w;
    log('5 steps.R made by the block', fs.existsSync(steps) && fs.readFileSync(steps, 'utf8').includes('chat <- twitch_chat()'));
    log('5 active editor after', vscode.window.activeTextEditor ? path.basename(vscode.window.activeTextEditor.document.fileName) : null);
    await vscode.commands.executeCommand('auraR.runSteps');
    await sleep(2000);
    await vscode.commands.executeCommand('notifications.clearAll');
    const term = await waitFor(() => vscode.window.terminals.find((t) => /R \(AURA\)|R Interactive|^R$/.test(t.name)), 30000);
    log('5 terminal', term ? term.name : null);
    const answer = path.join(ws, 'steps-check.txt').replace(/\\/g, '/');
    await sleep(40000); // the tidyverse, v2v, and the corpus load
    term.sendText(`writeLines(as.character(nrow(chat)), "${answer}")`);
    const got = await waitFor(() => fs.existsSync(answer) && fs.readFileSync(answer, 'utf8').trim(), 60000);
    log('5 chat rows in the session after Run my steps', got || null);

    // 6
    await vscode.commands.executeCommand('auraR.openWorkspaceView');
    await sleep(2000);
    log('6 Workspace view visible', await wb.eval(`Array.from(document.querySelectorAll('.pane-header')).some(function (h) { return /Workspace/.test(h.innerText); })`));
  } catch (e) {
    out.error = String((e && e.stack) || e);
  } finally {
    if (wb) wb.close();
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
