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
  // 0.5.1: the MC 427 R00 t-test of NaN and -Inf, and the R Field Guide C11 warning (R 4.6.1 text)
  't-test-nan-inf': '\tWelch Two Sample t-test\n\ndata:  log_likes by share_button\nt = NaN, df = NaN, p-value = NA\nalternative hypothesis: true difference in means between group no and group yes is not equal to 0\n95 percent confidence interval:\n NaN NaN\nsample estimates:\n mean in group no mean in group yes \n             -Inf              -Inf ',
  'mean-not-numeric': 'Warning message:\nThere was 1 warning in `summarize()`.\n\u2139 In argument: `average = mean(pct_gain)`.\nCaused by warning in `mean.default()`:\n! argument is not numeric or logical: returning NA ',
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
      // The tab opens when the watched PNG lands complete
      let tab = null;
      for (let i = 0; i < 40 && !(tab = pngTab(c.png)); i++) await sleep(500);
      if (tab) { await sleep(1000); tab = pngTab(c.png); }
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

    // R busy (0.5.1): R is still running a 25 s block when the line chart is sent, so the PNG lands
    // about 30 s after Run it. 0.5.0 gave up 12 s after sending and never opened the tab; the
    // watch waits for the file itself.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const rTerm = vscode.window.terminals.find((t) => t.name === 'R (AURA)');
    log('1 busy: R terminal found', !!rTerm);
    editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(analysisR), vscode.ViewColumn.One);
    if (rTerm) {
      rTerm.sendText('Sys.sleep(25)');
      await sleep(500);
      const sent = Date.now();
      await write('line', 0);
      let tab = null;
      for (let i = 0; i < 180 && !(tab = pngTab('viewers-over-time-line.png')); i++) await sleep(500);
      // The tab appears a moment before its group becomes the active one; read it again after a second
      if (tab) { await sleep(1000); tab = pngTab('viewers-over-time-line.png'); }
      const st = fs.statSync(path.join(figs, 'viewers-over-time-line.png'));
      log('1 busy: PNG tab', tab);
      log('1 busy: seconds from Run it to the PNG written', Math.round((st.mtimeMs - sent) / 1000));
      log('1 busy: seconds from Run it to the tab', tab ? Math.round((Date.now() - sent) / 1000) : null);
      await shot('busy R: line chart opened when the PNG landed', out);
    }

    // AURA_IT_P2_CHARTS_ONLY stops here: running this suite against 0.5.0, whose single-match quick
    // pick never closes on Enter, for the busy-R comparison
    if (process.env.AURA_IT_P2_CHARTS_ONLY) {
      fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
      return;
    }

    // 3. Explain an R error. The terminal panel and secondary side bar close first, so the
    // screenshots show the steps and link without scrolling at the recording zoom.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('workbench.action.closePanel');
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    const api = {};
    for (const [want, msg] of Object.entries(MESSAGES)) {
      api[want] = await vscode.commands.executeCommand('auraR.explainError', msg);
    }
    log('3 command API: matched ids per message', api);
    log('3 command API: each message finds its entry', Object.entries(api).map(([want, ids]) => `${want}: ${ids.includes(want) ? 'yes' : 'NO'}`));

    // The real input box, on a selection, then the full explanation (0.5.1). One match opens the
    // explanation straight away as a locked Markdown preview beside the code; two or more matches
    // show a quick pick to choose from, and the chosen one opens the same way. Tried on the entries
    // with the longest text (object-not-found, column-not-found), the most steps (v2v-restored),
    // and backslash-U, whose Step 1 the 0.5.0 quick pick cut to "put th...".
    const wb = await workbenchTarget();
    const ui = {};
    const UI_CASES = {
      'backslash-U': MESSAGES['backslash-U'],
      'object-not-found': MESSAGES['object-not-found'],
      'column-not-found': MESSAGES['column-not-found'],
      'v2v-restored': 'Warning: cannot remove prior installation of package \u2018rlang\u2019\nWarning: restored \u2018rlang\u2019',
      't-test-nan-inf': MESSAGES['t-test-nan-inf'],
      'two-matches': MESSAGES['object-not-found'] + '\n' + MESSAGES['named-input-equals'],
    };
    for (const [want, msg] of Object.entries(UI_CASES)) {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      const f = path.join(ws, `${want}.txt`);
      fs.writeFileSync(f, msg);
      const ed = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(f), vscode.ViewColumn.One);
      ed.selection = new vscode.Selection(0, 0, ed.document.lineCount, 0);
      const p = vscode.commands.executeCommand('auraR.explainError');
      await sleep(2000);
      const prefilled = wb ? await wb.eval(`(document.querySelector('.quick-input-widget input') || {}).value`) : null;
      if (wb) await pressEnter(wb);
      await sleep(2500);
      // The input box is one line, so VS Code drops the line breaks of a multi-line selection
      const r = { prefilledFromSelection: prefilled === msg.replace(/\r?\n/g, '') };
      if (want === 'two-matches') {
        r.title = wb ? await wb.eval(`(document.querySelector('.quick-input-widget .quick-input-title') || {}).innerText`) : null;
        r.rows = wb ? await wb.eval(QUICK_ROWS) : null;
        await shot('Explain an R error: two matches, the quick pick to choose one', out);
        await choose(1); // the second match
        await sleep(2500);
      }
      r.returned = await p;
      const tabs = [];
      for (const g of vscode.window.tabGroups.all) {
        for (const t of g.tabs) tabs.push({ label: t.label, viewColumn: g.viewColumn, active: t.isActive && g === vscode.window.tabGroups.activeTabGroup, viewType: (t.input && t.input.viewType) || null });
      }
      r.previewTab = tabs.find((t) => /R error explained/.test(t.label)) || null;
      r.tabs = tabs.map((t) => t.label);
      const shownId = want === 'two-matches' ? r.returned[1] : want;
      const page = vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'aura-explain' && d.uri.path.includes(shownId));
      const entry = ERROR_TABLE.find((x) => x.id === shownId);
      const text = page ? page.getText() : '';
      // Every Why and Step in full: the page carries each one once its Markdown escapes are removed
      const plain = text.replace(/\\([\\`*_{}[\]()<>#+\-.!|~])/g, '$1');
      r.shownEntry = shownId;
      r.pageFullText = !!entry && plain.includes(entry.why) && entry.fix.every((step, i) => plain.includes(`${i + 1}. ${step}`));
      r.pageHasLink = entry && entry.link ? text.includes(`](${entry.link.url})`) : 'no link on this entry';
      // Keyboard focus once the page has loaded: inside the preview's webview, not the bare body
      await sleep(2500);
      r.focus = wb ? await wb.eval(`(function () { var a = document.activeElement; return a ? a.tagName + (a.closest && a.closest('.webview') ? ' in webview' : '') + ' ' + (a.className || '') : null; })()`) : null;
      r.quickPickStillOpen = wb ? await wb.eval(`(function () { var q = document.querySelector('.quick-input-widget'); return !!q && getComputedStyle(q).display !== 'none'; })()`) : null;
      ui[want] = r;
      await shot(`Explain an R error: ${want}, the full explanation beside the code`, out);
    }
    log('3 UI path', ui);
    // The rendered preview, read through the DevTools targets of its webview frames
    const rendered = [];
    try {
      const list = await (await fetch(`http://127.0.0.1:${process.env.AURA_IT_CDP_PORT}/json/list`)).json();
      rendered.push({ targets: list.map((t) => `${t.type} ${String(t.url).slice(0, 60)}`) });
      for (const t of list) {
        if (!/vscode-webview:/.test(t.url || '')) continue;
        const c = new Cdp(t.webSocketDebuggerUrl);
        try {
          await c.open();
          const v = await c.eval(`(function () {
            var docs = [document];
            var inner = document.querySelector('iframe');
            try { if (inner && inner.contentDocument) docs.push(inner.contentDocument); } catch (e) {}
            for (var i = 0; i < docs.length; i++) {
              var d = docs[i];
              if (!d.querySelector('h1')) continue;
              return {
                h1: d.querySelector('h1').innerText,
                h2: Array.from(d.querySelectorAll('h2')).map(function (h) { return h.innerText; }),
                steps: Array.from(d.querySelectorAll('ol > li')).map(function (li) { return li.innerText; }),
                links: Array.from(d.querySelectorAll('a[href^="http"]')).map(function (a) { return a.getAttribute('href'); }),
                ellipsis: /\u2026/.test(d.body.innerText)
              };
            }
            return null;
          })()`);
          if (v) rendered.push(v);
        } catch (_) { /* not a page target */ }
        c.close();
      }
    } catch (e) {
      rendered.push({ error: String(e && e.message) });
    }
    log('3 rendered preview (DevTools)', rendered);
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
