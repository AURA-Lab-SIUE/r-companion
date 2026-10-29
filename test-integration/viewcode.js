// Write this view as R (code parity, 2026-10-28), in a real VS Code, run by scripts/integration.mjs
// with AURA_IT_SUITE=test-integration/viewcode.js and AURA_IT_CDP_PORT set.
//
// For each case it opens a CSV in the data viewer, sets filters and sorts through the grid's own
// API (the same models the column menus make), reads the item ids the grid shows in order, selects
// Write this view as R, then runs steps.R in a fresh R and reads the ids R keeps, in order. The two
// lists must be the same. One case codes a column first, so the view starts from coded_data.
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RSCRIPT = process.env.RSCRIPT || 'C:/Program Files/R/R-4.6.1/bin/Rscript.exe';
const LIB = process.env.R_COMPANION_LIB || '';

async function choose(down) {
  await sleep(1500);
  for (let i = 0; i < down; i++) {
    await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext');
    await sleep(120);
  }
  await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
}

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
  send(method, params = {}, ms = 15000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    // a target that never answers (a paused worker) must not stall the search
    return Promise.race([new Promise((resolve) => this.pending.set(id, resolve)), sleep(ms).then(() => ({ timedOut: true }))]);
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text + ' ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) };
    return r.result && r.result.result ? r.result.result.value : r;
  }
  close() { try { this.ws.close(); } catch (_) { /* closing */ } }
}

const VDOC = `(function () {
  var f = document.getElementById('active-frame');
  var d = f ? f.contentDocument : document;
  return d && d.getElementById('btn-view-code') ? d : null;
})()`;
const VWIN = `${VDOC}.defaultView`;

async function findTarget(test, what, log) {
  for (let i = 0; i < 30; i++) {
    for (const t of await cdpTargets()) {
      const c = new Cdp(t.webSocketDebuggerUrl);
      try {
        await Promise.race([c.open(), sleep(3000).then(() => { throw new Error('open timed out'); })]);
        const ok = await Promise.race([c.eval(test), sleep(3000).then(() => false)]);
        if (ok === true) return c;
      } catch (_) { /* next */ }
      c.close();
    }
    await sleep(1000);
  }
  log(`${what} target`, 'not found');
  return null;
}

function runR(ws, code) {
  const file = path.join(ws, '.viewcode-check.R');
  fs.writeFileSync(file, `.libPaths(c(${JSON.stringify(LIB)}, .libPaths()))\n${code}`);
  // The runner's R_LIBS_USER can list another R version's library first; the check uses this R's own
  const env = { ...process.env };
  delete env.R_LIBS_USER;
  const r = cp.spawnSync(RSCRIPT, ['--vanilla', file], { cwd: ws, env, encoding: 'utf8', timeout: 300000, windowsHide: true });
  fs.rmSync(file, { force: true });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

// Blanks, capitals, a decimal tie, a negative number, and text that sorts by character code
const SYNTH = [
  'id,name,score,note',
  '1,Alice,10,',
  '2,bob,,hello',
  '3,ALICE B,5.5,x',
  '4,,20,Hello there',
  '5,Carl,5.5,gg',
  '6,alice,-1,GG wp',
  '7,Zed,100,no gg here',
  '8,ali,0,',
  '9,Bob,7,ok',
  '10,carl,,OK',
].join('\n') + '\n';

async function run() {
  const out = { steps: [], checks: [] };
  const log = (name, value) => out.steps.push({ name, value });
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, ...(ok ? {} : { detail }) });
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  try {
    const ext = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await ext.activate();
    log('version', ext.packageJSON.version);
    fs.mkdirSync(path.join(ws, 'data'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'data', 'scores.csv'), SYNTH);
    fs.copyFileSync('O:\\10-teaching\\2026_Fall\\MC427\\modules\\mod05\\mod05-E01-practice-tweets.csv', path.join(ws, 'data', 'practice-tweets.csv'));
    const wb = await findTarget(`!!document.querySelector('.monaco-workbench')`, 'workbench', log);

    const cases = [
      {
        label: 'synthetic: text contains (capitals), number between, sort desc with blanks',
        file: 'scores.csv', key: 'id',
        filter: { name: { filterType: 'text', type: 'contains', filter: 'AL' }, score: { filterType: 'number', type: 'inRange', filter: -5, filterTo: 50 } },
        sort: [{ colId: 'score', sort: 'desc' }],
      },
      {
        label: 'synthetic: does not contain keeps blanks; text sort by character code, blanks last',
        file: 'scores.csv', key: 'id',
        filter: { note: { filterType: 'text', operator: 'OR', conditions: [{ filterType: 'text', type: 'notContains', filter: 'gg' }, { filterType: 'text', type: 'startsWith', filter: 'no' }] } },
        sort: [{ colId: 'name', sort: 'asc' }],
      },
      {
        label: 'synthetic: number not equal skips blanks; two sorts',
        file: 'scores.csv', key: 'id',
        filter: { score: { filterType: 'number', type: 'notEqual', filter: 5.5 } },
        sort: [{ colId: 'note', sort: 'desc' }, { colId: 'id', sort: 'asc' }],
      },
      {
        label: 'practice tweets: text contains, number at least, sort by likes then row_id',
        file: 'practice-tweets.csv', key: 'row_id',
        filter: { text: { filterType: 'text', type: 'contains', filter: 'fortnite' }, retweet_count: { filterType: 'number', type: 'greaterThanOrEqual', filter: 1 } },
        sort: [{ colId: 'like_count', sort: 'desc' }, { colId: 'row_id', sort: 'asc' }],
      },
      {
        label: 'practice tweets coded: filter on a code, from coded_data',
        file: 'practice-tweets.csv', key: 'row_id', code: true,
        filter: { tone: { filterType: 'text', type: 'equals', filter: 'Positive' } },
        sort: [{ colId: 'row_id', sort: 'desc' }],
      },
    ];

    for (const c of cases) {
      const steps = path.join(ws, 'steps.R');
      fs.rmSync(steps, { force: true });
      fs.rmSync(path.join(ws, 'data', 'derived'), { recursive: true, force: true });
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      const csv = path.join(ws, 'data', c.file);
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(csv), vscode.ViewColumn.One);
      const v = vscode.commands.executeCommand('auraR.openDataViewer');
      await choose(0); // The CSV open in the editor
      await v;
      await sleep(4000);
      log(`${c.label}: viewer opened`, true);
      fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
      const viewer = await findTarget(`!!${VDOC}`, 'viewer webview', log);
      if (!viewer) throw new Error('no viewer target');
      if (c.code) {
        // Add a coding column through the extension's prompts, then enter codes on rows 1, 3, 5, ...
        await viewer.eval(`${VDOC}.getElementById('btn-add').click()`);
        const typeIn = async (text) => {
          await sleep(1200);
          await wb.send('Input.insertText', { text });
          await sleep(300);
          await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
        };
        await typeIn('tone');
        await choose(0); // Allowed values
        await typeIn('positive, neutral, negative');
        await choose(0); // Code it once
        await sleep(1500);
        log(`${c.label}: codes set`, await viewer.eval(`(function(){var a=${VWIN}.__auraApi;var n=0;a.forEachNode(function(r){if(r.rowIndex%2===0&&r.rowIndex<60){r.setDataValue('tone', ['positive','neutral','negative'][(r.rowIndex/2)%3]);n++;}});return n;})()`));
        await sleep(3000);
      }
      log(`${c.label}: set view`, await viewer.eval(`(function(){try{var a=${VWIN}.__auraApi;a.setFilterModel(${JSON.stringify(c.filter)});a.applyColumnState({state:${JSON.stringify(c.sort.map((s, i) => ({ colId: s.colId, sort: s.sort, sortIndex: i })))},defaultState:{sort:null}});return a.getDisplayedRowCount();}catch(e){return 'ERR '+e.message;}})()`));
      await sleep(1500);
      const shown = await viewer.eval(`(function(){var a=${VWIN}.__auraApi;var ids=[];a.forEachNodeAfterFilterAndSort(function(n){ids.push(String(n.data[${JSON.stringify(c.key)}]));});return ids;})()`);
      if (!Array.isArray(shown)) log(`${c.label}: grid ids`, shown);
      await viewer.eval(`${VDOC}.getElementById('btn-view-code').click()`);
      await sleep(3000);
      log(`${c.label}: status`, await viewer.eval(`${VDOC}.getElementById('aura-status').textContent`));
      // The block is in steps.R on disk, or in its open editor when VS Code opened it
      const open = vscode.workspace.textDocuments.find((d) => path.resolve(d.fileName) === path.resolve(steps));
      if (open) await open.save();
      const script = fs.existsSync(steps) ? fs.readFileSync(steps, 'utf8') : '';
      const obj = (script.match(/^(\w+_view) <- /m) || [])[1];
      log(`${c.label}: block`, script.split(/\r?\n/).filter((l) => /^\s*(filter|arrange)\(|_view <- /.test(l)));
      const r = runR(ws, `suppressMessages(source("steps.R"))\ncat("IDS=", jsonlite::toJSON(as.character(${obj}$${c.key})), "\\n", sep = "")\n`);
      const got = JSON.parse((r.out.match(/IDS=(\[.*\])/) || [])[1] || 'null');
      check(`${c.label}: R keeps the ${shown.length} rows the grid showed, in the same order`, Array.isArray(got) && JSON.stringify(got) === JSON.stringify(shown), { grid: Array.isArray(shown) ? shown.slice(0, 15) : shown, r: got ? got.slice(0, 15) : r.out.slice(-600) });
      viewer.close();
      // a stall in a later case still leaves the cases so far on disk
      fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
    }
    wb && wb.close();
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
