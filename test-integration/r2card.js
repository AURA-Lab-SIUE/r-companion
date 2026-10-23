// The R2 test card (O:\20-research\aura-lab\r-companion\R2-LEITH-HP-TEST-CARD.md), steps 4 to 12,
// driven inside a real VS Code by scripts/integration.mjs with AURA_IT_SUITE=test-integration/r2card.js.
// Menus and notifications are answered through VS Code's own commands (quick-open navigation and
// notification.acceptPrimaryAction), never by keystrokes into the desktop. The reliability grid
// is a webview, which the extension host cannot reach, so the suite drives it over the DevTools
// protocol of this same window (AURA_IT_CDP_PORT): it sets codes, presses the grid's own buttons,
// and sends real Tab key events to check the keyboard path. Each generated block is also run
// through Rscript in the test folder, so the numbers the card quotes are read from R, not assumed.
// Steps 1 to 3 (copy, install from VSIX, trust) need the real desktop and are not covered here.
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

/** Select the primary button of the newest notification ("Run it"). */
async function acceptToast() {
  await sleep(1500);
  await vscode.commands.executeCommand('notification.acceptPrimaryAction');
}

// The Rscript the extension itself found first, so both read the same library
async function rscriptPath() {
  const d = await vscode.commands.executeCommand('auraR.diagnostics');
  return (d && d.r && d.r[0] && d.r[0].rscript) || 'Rscript';
}
let RSCRIPT = 'Rscript';
const rscript = () => RSCRIPT;

/** Run R code in the test folder and return its console text (stdout and stderr). */
function runR(ws, code, name) {
  const file = path.join(ws, `.r2card-${name}.R`);
  fs.writeFileSync(file, code);
  const r = cp.spawnSync(rscript(), ['--vanilla', '-e', `options(width = 100); source("${path.basename(file)}", echo = TRUE, print.eval = TRUE, max.deparse.length = Inf)`], {
    cwd: ws,
    env: process.env,
    encoding: 'utf8',
    timeout: 180000,
    windowsHide: true,
  });
  fs.rmSync(file, { force: true });
  return `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
}

const grab = (text, re) => {
  const m = text.match(re);
  return m ? m[0] : null;
};

// ---------- DevTools protocol, for the webview ----------
async function cdpTargets() {
  const port = process.env.AURA_IT_CDP_PORT;
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
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
  close() { try { this.ws.close(); } catch (_) { /* closing */ } }
}

// The grid document: inside the webview host frame, the inner active-frame holds the page.
const DOC = `(function () {
  var f = document.getElementById('active-frame');
  var d = f ? f.contentDocument : document;
  return d && d.getElementById('startPass2') ? d : null;
})()`;

async function findGrid(log) {
  for (let i = 0; i < 30; i++) {
    const targets = await cdpTargets();
    const hosts = targets.filter((t) => /vscode-webview/.test(t.url));
    for (const t of hosts) {
      const c = new Cdp(t.webSocketDebuggerUrl);
      try {
        await c.open();
        const ok = await c.eval(`!!${DOC}`);
        if (ok === true) { log('grid webview target', { type: t.type, url: t.url.slice(0, 60) }); return c; }
      } catch (_) { /* try the next target */ }
      c.close();
    }
    await sleep(1000);
  }
  log('grid webview target', 'not found: ' + JSON.stringify((await cdpTargets()).map((t) => [t.type, t.url.slice(0, 50)])));
  return null;
}

async function run() {
  const out = { steps: [], shots: [] };
  const log = (name, value) => out.steps.push({ name, value });
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  try {
    const ext = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await ext.activate();
    log('version', ext.packageJSON.version);
    RSCRIPT = await rscriptPath();
    log('Rscript', RSCRIPT);
    log('R library seen by R', runR(ws, 'cat(.libPaths(), sep = "\\n"); cat("v2v", as.character(packageVersion("v2v")), "\\n")', 'lib').split('\n').filter((l) => /v2v|rlib|library/i.test(l)).slice(-4));

    // 4. A new R script, saved as wrangle.R, cursor in it
    const wrangle = path.join(ws, 'wrangle.R');
    fs.writeFileSync(wrangle, '');
    let editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(wrangle));
    log('4 wrangle.R language', editor.document.languageId);

    // 5. Pick MC 451 (second in the list), then the setup check
    const picked = vscode.commands.executeCommand('auraR.pickCourse');
    await choose(1);
    log('5 pick returned', (await picked) ?? null);
    await shot('5 course set to MC 451 toast', out);
    const check = await vscode.commands.executeCommand('auraR.checkSetup', { course: 'mc451', silent: true });
    log('5 setup failing', check.failing);
    log('5 setup v2v line', check.text.split('\n').filter((l) => /v2v/.test(l)).slice(0, 3));

    // 6. Write R code > Load the course Twitch corpus (second R2 item), Run it
    editor = await vscode.window.showTextDocument(editor.document);
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    const w6 = vscode.commands.executeCommand('auraR.writeCode');
    await choose(1);
    await acceptToast();
    await w6;
    const t6 = editor.document.getText();
    log('6 first line', t6.split('\n')[0]);
    log('6 has chat and streams', t6.includes('chat <- twitch_chat()') && t6.includes('streams <- twitch_streams()'));
    log('6 terminals', vscode.window.terminals.map((t) => t.name));
    await sleep(25000);
    await shot('6 import block and the R terminal glimpse', out);
    const r6 = runR(ws, t6, 'import');
    log('6 R: chat rows', grab(r6, /Rows: [\d,]+[\s\S]{0,400}?\$ id/) ? r6.match(/Rows: [\d,]+/g) : r6.slice(-600));

    // 7. Mutate (sixth R2 item), then Count (seventh) with the course default columns
    const end = () => {
      const last = editor.document.lineCount;
      editor.selection = new vscode.Selection(last, 0, last, 0);
    };
    await editor.edit((b) => b.insert(new vscode.Position(editor.document.lineCount, 0), '\n'));
    end();
    const w7a = vscode.commands.executeCommand('auraR.writeCode');
    await choose(5);
    await acceptToast();
    await w7a;
    await editor.edit((b) => b.insert(new vscode.Position(editor.document.lineCount, 0), '\n'));
    end();
    const w7b = vscode.commands.executeCommand('auraR.writeCode');
    await choose(6);
    await choose(0); // Use the course default columns
    await acceptToast();
    await w7b;
    const t7 = editor.document.getText();
    log('7 banners', t7.split('\n').filter((l) => l.startsWith('# ----')));
    log('7 count reads', t7.split(/\r?\n/).filter((l) => /^\w+ %>%$/.test(l)).pop());
    await sleep(12000);
    await shot('7 mutate and count blocks, the count table in the terminal', out);
    const r7 = runR(ws, t7, 'count');
    log('7 R: count table', r7.split(/\r?\n/).filter((l) => /^\s*\d+ \S+\s+\d+\s*$|more rows/.test(l)).slice(-4));
    log('7 R: errors', r7.split('\n').filter((l) => /^Error/.test(l)));

    // 8. The reliability grid (sixteenth R2 item)
    await editor.edit((b) => b.insert(new vscode.Position(editor.document.lineCount, 0), '\n'));
    end();
    const w8 = vscode.commands.executeCommand('auraR.writeCode');
    await choose(15);
    await w8;
    await sleep(3000);
    log('8 open tabs', vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label)));
    const g = await findGrid(log);
    if (g) {
      const p1 = ['calm', 'calm', 'high-energy', 'calm', 'high-energy', 'calm'];
      const p2 = ['calm', 'high-energy', 'high-energy', 'calm', 'high-energy', 'calm'];
      log('8 set pass 1', await g.eval(`(function(){var d=${DOC};var v=${JSON.stringify(p1)};v.forEach(function(x,i){var s=d.getElementById('p1-'+(i+1));s.value=x;s.dispatchEvent(new Event('change',{bubbles:true}));});return v.map(function(_,i){return d.getElementById('p1-'+(i+1)).value;});})()`));
      log('8 before pass 2', await g.eval(`(function(){var d=${DOC};return {pass2Disabled:d.getElementById('p2-1').disabled, pass2date:d.getElementById('pass2date').value, step:d.getElementById('stepLabel').textContent};})()`));
      await shot('8 Pass 1 coded', out);
      await g.eval(`${DOC}.getElementById('startPass2').click()`);
      await sleep(500);
      log('8 after Start Pass 2', await g.eval(`(function(){var d=${DOC};var s=d.getElementById('p1-1');var cs=d.defaultView.getComputedStyle(s);return {pass1Visible:cs.visibility!=='hidden'&&cs.display!=='none'&&s.offsetParent!==null&&cs.opacity!=='0', pass1CellClass:s.parentElement.className, pass1AriaHidden:s.getAttribute('aria-hidden'), pass2Disabled:d.getElementById('p2-1').disabled, pass2date:d.getElementById('pass2date').value, step:d.getElementById('stepLabel').textContent, status:d.getElementById('status').textContent};})()`));
      log('8 today', new Date().toISOString().slice(0, 10));
      await shot('8 Pass 2 started, Pass 1 hidden, Pass 2 date filled', out);

      // Keyboard only: real Tab key events through the webview, reading the focused element and its outline
      await g.eval(`${DOC}.getElementById('method').focus()`);
      const order = [];
      for (let i = 0; i < 26; i++) {
        await g.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await g.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await sleep(80);
        order.push(await g.eval(`(function(){var d=${DOC};var a=d.activeElement;if(!a)return null;var cs=d.defaultView.getComputedStyle(a);return (a.id||a.tagName)+' outline='+cs.outlineStyle+' '+cs.outlineWidth;})()`));
      }
      log('8 Tab order after Method', order);
      // Arrow keys set a code on a focused select
      await g.eval(`${DOC}.getElementById('p2-7').focus()`);
      await g.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
      await g.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
      await sleep(200);
      log('8 ArrowDown on p2-7 sets', await g.eval(`${DOC}.getElementById('p2-7').value`));
      await g.eval(`(function(){var s=${DOC}.getElementById('p2-7');s.value='';})()`);
      await shot('8 keyboard focus on a Pass 2 field', out);

      log('8 set pass 2', await g.eval(`(function(){var d=${DOC};var v=${JSON.stringify(p2)};v.forEach(function(x,i){var s=d.getElementById('p2-'+(i+1));s.value=x;s.dispatchEvent(new Event('change',{bubbles:true}));});return v.map(function(_,i){return d.getElementById('p2-'+(i+1)).value;});})()`));
      // Back to the script so the block lands there, as it does when the student clicks in the panel
      await g.eval(`${DOC}.getElementById('generate').click()`);
      g.close();
      await acceptToast();
      await sleep(4000);
      const csv = path.join(ws, 'data', 'reliability-pilot.csv');
      log('8 csv exists', fs.existsSync(csv));
      if (fs.existsSync(csv)) log('8 csv', fs.readFileSync(csv, 'utf8').split('\n'));
      const doc = vscode.workspace.textDocuments.find((d) => d.fileName === wrangle);
      const t8 = doc ? doc.getText() : '';
      const i8 = t8.lastIndexOf('# ---- Load the tidyverse, the course package, and a CSV file ----');
      const b8 = i8 >= 0 ? t8.slice(i8) : '';
      log('8 block banners', b8.split('\n').filter((l) => l.startsWith('# ----')));
      log('8 block calls', b8.split('\n').filter((l) => /irr::|reliability\(|method = /.test(l)));
      await sleep(10000);
      await shot('8 reliability block and the terminal kappa and alpha', out);
      const r8 = runR(ws, b8, 'reliability');
      log('8 R: kappa and alpha', r8.split('\n').filter((l) => /Kappa =|alpha =|Cohen's kappa|share_agree|^\s*1\s+\d+\s+[\d.]+$/.test(l)));
      log('8 R: errors', r8.split('\n').filter((l) => /^Error/.test(l)));
    }

    // 9 and 10. MC 427: the practice tweets CSV, Import a CSV file (first MC 427 item)
    const src = 'O:\\10-teaching\\2026_Fall\\MC427\\modules\\mod05\\mod05-E01-practice-tweets.csv';
    log('9 source exists', fs.existsSync(src));
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(ws, 'mod05-E01-practice-tweets.csv'));
    const p427 = vscode.commands.executeCommand('auraR.pickCourse');
    await choose(0);
    log('10 pick returned', (await p427) ?? null);
    const tweets = path.join(ws, 'tweets.R');
    fs.writeFileSync(tweets, '');
    editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(tweets));
    // 0.5.3: Import a data file opens the system's file dialog, which a suite cannot drive, so the
    // file and table name are given; the peek and Run it are the real steps
    const w10 = vscode.commands.executeCommand('auraR.importDataFile', { file: path.join(ws, 'mod05-E01-practice-tweets.csv'), name: 'df' });
    await sleep(8000); // the column probe
    await choose(0); // Write the code that loads this table
    await sleep(1500);
    await acceptToast();
    await w10;
    const t10 = editor.document.getText();
    log('10 block', t10.split('\n').filter((l) => /^# ----|read_csv|glimpse/.test(l)));
    await sleep(10000);
    await shot('10 MC 427 import block and glimpse', out);
    const r10 = runR(ws, t10, 'tweets');
    log('10 R: rows and columns', r10.match(/(Rows|Columns): [\d,]+/g));

    // 11. R3 Describe > Frequency table (the eighth MC 427 item; every release is on from 0.4.0)
    await editor.edit((b) => b.insert(new vscode.Position(editor.document.lineCount, 0), '\n'));
    end();
    // 0.5.3 added Join two tables to MC 427's menu, so the task is named (the AURA panel's route)
    // rather than picked by position
    const w11 = vscode.commands.executeCommand('auraR.writeCode', 'frequency');
    await choose(0);
    await acceptToast();
    await w11;
    const t11 = editor.document.getText();
    log('11 banners', t11.split('\n').filter((l) => l.startsWith('# ----')));
    await sleep(8000);
    await shot('11 frequency table block', out);
    const r11 = runR(ws, t11, 'freq');
    log('11 R: percent column', /percent/.test(r11.split('Frequency table').pop() || ''));
    log('11 R: errors', r11.split('\n').filter((l) => /^Error/.test(l)));

    // 12. A .qmd file, cursor below plain text: the block is wrapped in an R chunk
    const notes = path.join(ws, 'notes.qmd');
    fs.writeFileSync(notes, 'Some notes about the data.\n');
    editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(notes));
    editor.selection = new vscode.Selection(1, 0, 1, 0);
    // Any block shows the chunk wrapping. 0.5.3's first item, Import a data file, opens the
    // system's file dialog, which a suite cannot answer, so the task is named instead.
    const w12 = vscode.commands.executeCommand('auraR.writeCode', 'mutate');
    await sleep(1500);
    await vscode.commands.executeCommand('notifications.clearAll');
    await w12;
    log('12 qmd lines', editor.document.getText().split('\n').filter((l) => /^```|^# ----/.test(l)));
    await shot('12 notes.qmd with the chunk', out);

    // Every block kept its comment header
    const all = [wrangle, tweets].map((f) => vscode.workspace.textDocuments.find((d) => d.fileName === f)?.getText() ?? '').join('\n');
    log('13 banner count in wrangle.R and tweets.R', (all.match(/^# ---- /gm) || []).length);

    // Not a card step: once the script has made analysis, Count asks which table and offers it
    // second, after chat (the default). Back to MC 451, a scratch script, nothing run.
    const pBack = vscode.commands.executeCommand('auraR.pickCourse');
    await choose(1);
    log('T pick returned', (await pBack) ?? null);
    const pick = path.join(ws, 'pick.R');
    fs.writeFileSync(pick, 'analysis <- read_rds("data/twitch_analysis.RDS")\n');
    editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(pick));
    end();
    const wT = vscode.commands.executeCommand('auraR.writeCode', 'count');
    await choose(1); // the table list: chat (the default), then analysis
    await choose(0); // Use the course default columns
    await sleep(1500);
    await vscode.commands.executeCommand('notifications.clearAll');
    await wT;
    log('T count block after analysis', editor.document.getText().split('\n').filter((l) => /%>%|count\(/.test(l)));
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
