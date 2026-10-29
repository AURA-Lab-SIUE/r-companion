// The R3 and R4 command-API suite (0.4.0, #rgui), run inside a real VS Code by
// scripts/integration.mjs with AURA_IT_SUITE=test-integration/r3r4.js and AURA_IT_CDP_PORT set.
//
// MC 451, one analysis.qmd: Write R code inserts the corpus and saved-analysis loads, a frequency
// table, a bar chart (alt text in labs() and a fig-alt chunk option), the settings block, then a
// chi-square test, a Welch t-test, a one-way ANOVA, a regression, and the APA numbers for the
// t-test, each in a Quarto chunk, each run in the R terminal through the "Run it" button (the chart
// is run by Rscript only, so no native plot window opens). The whole document's R is then run by
// Rscript and the numbers read from R. Check my test choice runs through its quick picks; the three
// Copilot tools are invoked through vscode.lm.invokeTool for MC 451 (on) and MC 427 (off). The data
// viewer opens a CSV, adds a coding column, codes two rows through the grid, and inserts the
// rebuild code, which Rscript then runs. MC 427's Test menu shows the cross-check heading (U2).
//
// Menus and notifications are answered through VS Code's own commands; text goes into input boxes
// as DevTools Input.insertText events on this test window only, never the desktop.
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

async function clearToasts() {
  await sleep(1500);
  await vscode.commands.executeCommand('notifications.clearAll');
}

let RSCRIPT = 'Rscript';

/** Run R code in the test folder and return its console text. */
function runR(ws, code, name) {
  const file = path.join(ws, `.r3r4-${name}.R`);
  fs.writeFileSync(file, code);
  const r = cp.spawnSync(RSCRIPT, ['--vanilla', '-e', `options(width = 120); source("${path.basename(file)}", echo = TRUE, print.eval = TRUE, max.deparse.length = Inf)`], {
    cwd: ws,
    env: process.env,
    encoding: 'utf8',
    timeout: 300000,
    windowsHide: true,
  });
  fs.rmSync(file, { force: true });
  return `${r.stdout ?? ''}\n${r.stderr ?? ''}`.replace(/\r\n/g, '\n');
}

/** The R code of every ```{r} chunk in a Quarto document, in order. */
function chunksOf(qmd) {
  const out = [];
  const re = /```\{r[^}]*\}\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(qmd.replace(/\r\n/g, '\n')))) out.push(m[1]);
  return out;
}

// ---------- DevTools protocol, for the webview and the quick input ----------
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
  close() { try { this.ws.close(); } catch (_) { /* closing */ } }
}

// The viewer document, inside the webview host frame
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

/** Type into the focused quick input of this window, then press Enter. */
async function typeIntoInput(workbench, text) {
  await sleep(1200);
  await workbench.send('Input.insertText', { text });
  await sleep(300);
  await workbench.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await workbench.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
}

async function run() {
  const out = { steps: [], shots: [] };
  const log = (name, value) => out.steps.push({ name, value });
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  try {
    const ext = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await ext.activate();
    const { menuTasks } = require(path.join(ext.extensionPath, 'out', 'src', 'menus.js'));
    log('version', ext.packageJSON.version);
    const diag = await vscode.commands.executeCommand('auraR.diagnostics');
    RSCRIPT = (diag && diag.r && diag.r[0] && diag.r[0].rscript) || 'Rscript';
    log('Rscript', RSCRIPT);
    log('R library', runR(ws, 'cat(.libPaths(), sep = "\\n"); for (p in c("v2v", "effectsize", "broom", "lm.beta", "irr")) cat(p, as.character(packageVersion(p)), "\\n")', 'lib').split('\n').filter((l) => /^(v2v|effectsize|broom|lm\.beta|irr) /.test(l)));

    // The saved analysis the MC 451 menus read: data/twitch_analysis.RDS, built as the R2 menus build it
    // The golden fixtures are not in the .vsix: read them from the repository this suite lives in
    const golden = path.join(__dirname, '..', 'golden', 'fixtures', 'v2v', '_setup-build-analysis.R');
    const build = runR(ws, fs.readFileSync(golden, 'utf8'), 'build');
    log('0 analysis RDS built', fs.existsSync(path.join(ws, 'data', 'twitch_analysis.RDS')) || build.slice(-400));

    const pick451 = vscode.commands.executeCommand('auraR.pickCourse');
    await choose(1);
    log('1 pick returned', (await pick451) ?? null);
    const tasks = menuTasks('mc451', true);
    log('1 MC 451 menu', tasks);

    const qmd = path.join(ws, 'analysis.qmd');
    fs.writeFileSync(qmd, '---\ntitle: "R3 and R4 check"\n---\n\nThe chunks below come from the R Companion menus.\n');
    let editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(qmd));
    const end = () => {
      const last = editor.document.lineCount;
      editor.selection = new vscode.Selection(last, 0, last, 0);
    };

    /** Write one menu task at the end of the document; run it in the R terminal or not. */
    async function write(task, { run = true, extra = [] } = {}) {
      editor = await vscode.window.showTextDocument(editor.document);
      end();
      const p = vscode.commands.executeCommand('auraR.writeCode');
      await choose(tasks.indexOf(task));
      for (const e of extra) await choose(e);
      if (run) await acceptToast();
      else await clearToasts();
      await p;
      showLastChunk();
    }

    /** Scroll so the newest chunk sits at the top of the editor, for the screenshots. */
    function showLastChunk() {
      const lines = editor.document.getText().split(/\r?\n/);
      let i = lines.length - 1;
      while (i > 0 && !lines[i].startsWith('```{r')) i--;
      editor.revealRange(new vscode.Range(i, 0, i, 0), vscode.TextEditorRevealType.AtTop);
    }

    // 2. Describe: the corpus and the saved analysis, a frequency table, a bar chart
    await write('import-course-dataset');
    await sleep(20000);
    await write('import-rds');
    await sleep(6000);
    await write('frequency', { extra: [0] }); // Use the course default columns
    await sleep(6000);
    await shot('2 frequency table chunk and its table in the R terminal', out);
    await write('bar', { run: false, extra: [1] }); // Use the course example
    const t2 = editor.document.getText().replace(/\r\n/g, '\n');
    log('2 chunk fences and banners', t2.split('\n').filter((l) => /^```|^# ----|^#\| /.test(l)));
    log('2 bar chunk has fig-alt first and alt in labs()', /```\{r\}\n#\| fig-alt: "YOUR TURN[^\n]*\n# ---- Bar chart/.test(t2) && /alt = "YOUR TURN: one sentence/.test(t2));
    await shot('3 bar chart chunk with the fig-alt line and alt in labs()', out);

    // 3. Tests: the settings block, then chi-square, t-test, ANOVA, regression, and the APA numbers
    await write('settings-block', { extra: [0] }); // Use the course variables
    await sleep(8000);
    await write('chi-square');
    await sleep(8000);
    await shot('4 chi-square chunk and the test in the R terminal', out);
    await write('t-test');
    await sleep(10000);
    await write('anova');
    await sleep(8000);
    await write('regression');
    await sleep(10000);
    await shot('5 regression chunk and its summary in the R terminal', out);
    await write('apa-check', { extra: [0] }); // the t-test
    await sleep(10000);
    await shot('6 APA numbers chunk and its printed line', out);
    log('6 terminals', vscode.window.terminals.map((t) => t.name));

    await vscode.commands.executeCommand('workbench.action.files.save');
    const doc = editor.document.getText().replace(/\r\n/g, '\n');
    log('6 banners in analysis.qmd', doc.split('\n').filter((l) => l.startsWith('# ---- ')));
    const chunks = chunksOf(doc);
    log('6 chunk count', chunks.length);
    const rAll = runR(ws, chunks.join('\n'), 'all');
    log('7 R: errors', rAll.split('\n').filter((l) => /^Error/.test(l)));
    log('7 R: frequency', rAll.split('\n').filter((l) => /^\s*\d\s+(gaming|non-gaming)\s+\d+\s+[\d.]+\s*$/.test(l)));
    log('7 R: chi-square', rAll.split('\n').filter((l) => /822\.6|Cramer's V|Chi-squared/.test(l)).slice(0, 6));
    log('7 R: t-test', rAll.split('\n').filter((l) => /^1\s+-?[\d.]+\s+[\d.]+\s+[\d.]+\s+-4\.9/.test(l)).slice(0, 2));
    log('7 R: anova F', rAll.split('\n').filter((l) => /^group3\s+2\s/.test(l)));
    log('7 R: regression', rAll.split('\n').filter((l) => /^predictor\s|Multiple R-squared|F-statistic/.test(l)));
    log('7 R: APA line', rAll.split('\n').filter((l) => /^t\([\d.]+\) = /.test(l)));
    log('7 R: bar png', fs.existsSync(path.join(ws, 'figures', 'top-games-bar.png')));

    // 4. Check my test choice through its quick picks: numeric outcome, two groups, chi-square
    const tc = vscode.commands.executeCommand('auraR.checkTestChoice');
    await choose(0);
    await choose(0);
    await sleep(1200);
    await shot('8 Check my test choice: the test list', out);
    await choose(0); // chi-square, the first test listed
    const verdict = await tc;
    log('8 verdict for chi-square on a number by two groups', verdict);
    await shot('9 the does-not-fit warning', out);
    await clearToasts();
    log('8 verdict for a t-test (args)', await vscode.commands.executeCommand('auraR.checkTestChoice', { outcome: 'numeric', comparison: 'categorical-two-groups', chosenTest: 't-test' }));

    // 5. The Copilot tools, through the language-model API, MC 451 (on)
    const names = ['aura_r_check_setup', 'aura_r_explain_error', 'aura_r_check_test_choice'];
    log('10 lm.tools from this extension', (vscode.lm.tools || []).filter((t) => names.includes(t.name)).map((t) => ({ name: t.name, tags: t.tags })));
    const invoke = async (name, input) => {
      try {
        const r = await vscode.lm.invokeTool(name, { input, toolInvocationToken: undefined }, new vscode.CancellationTokenSource().token);
        return r.content.map((p) => p.value).join('\n');
      } catch (e) {
        return 'ERROR ' + String(e && e.message);
      }
    };
    log('10 MC 451 setup tool', (await invoke(names[0], {})).split('\n').slice(0, 4));
    log('10 MC 451 error tool', (await invoke(names[1], { message: "Error in library(v2v) : there is no package called 'v2v'" })).split('\n').slice(0, 3));
    log('10 MC 451 test tool', await invoke(names[2], { outcome: 'numeric', comparison: 'categorical-three-plus-groups', chosenTest: 't-test' }));

    // 6. The data viewer: the practice tweets CSV, a coding column, two codes, the rebuild code
    const src = 'O:\\10-teaching\\2026_Fall\\MC427\\modules\\mod05\\mod05-E01-practice-tweets.csv';
    const csv = path.join(ws, 'data', 'practice-tweets.csv');
    fs.copyFileSync(src, csv);
    const before = fs.readFileSync(csv);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(csv), vscode.ViewColumn.One);
    const v = vscode.commands.executeCommand('auraR.openDataViewer');
    await choose(0); // The CSV open in the editor
    await v;
    await sleep(4000);
    const viewer = await findTarget(`!!${VDOC}`, log, 'viewer webview');
    const workbench = await findTarget(`!!document.querySelector('.monaco-workbench')`, log, 'workbench');
    if (viewer && workbench) {
      log('11 viewer rows', await viewer.eval(`${VWIN}.__auraApi.getDisplayedRowCount()`));
      await shot('10 data viewer open on the practice tweets', out);
      await viewer.eval(`${VDOC}.getElementById('btn-add').click()`);
      await typeIntoInput(workbench, 'tone');
      await choose(0); // Allowed values (a dropdown)
      await typeIntoInput(workbench, 'positive, neutral, negative');
      await choose(0); // Code it once (the second choice codes it twice, for reliability)
      await sleep(1500);
      log('11 coding columns', await viewer.eval(`${VWIN}.__auraApi.getColumnDefs().map(function(c){return c.field;}).slice(-2)`));
      log('11 set codes', await viewer.eval(`(function(){var a=${VWIN}.__auraApi;var out=[];a.forEachNode(function(n){if(n.rowIndex===0||n.rowIndex===2){n.setDataValue('tone', n.rowIndex===0?'positive':'negative');out.push(n.id);}});return out;})()`));
      await sleep(2500);
      const codes = path.join(ws, 'data', 'derived', 'practice-tweets-codes.csv');
      log('11 codes file', fs.existsSync(codes) ? fs.readFileSync(codes, 'utf8').trim().split(/\r?\n/) : 'missing');
      await shot('11 coding column tone with two codes', out);
      // The first code puts the rebuild block at the end of analysis.qmd by itself (code parity);
      // Insert rebuild code then only offers to show it
      editor = await vscode.window.showTextDocument(editor.document, vscode.ViewColumn.Two);
      const autoAppended = editor.document.getText().includes('"data/derived/practice-tweets-codes.csv"');
      log('12 rebuild block added by the first code', autoAppended);
      end();
      await viewer.eval(`${VDOC}.getElementById('btn-rebuild').click()`);
      await sleep(3000);
      await shot('12 Insert rebuild code offers to show the block already there', out);
      await clearToasts();
      const withRebuild = editor.document.getText().replace(/\r\n/g, '\n');
      log('12 rebuild blocks in analysis.qmd', withRebuild.split('"data/derived/practice-tweets-codes.csv"').length - 1);
      const rebuild = withRebuild.slice(withRebuild.lastIndexOf('```{r'));
      log('12 rebuild chunk', rebuild.split('\n'));
      showLastChunk();
      await shot('12 rebuild code inserted beside the viewer', out);
      const r12 = runR(ws, chunksOf(rebuild).join('\n') + '\ncoded_data %>% filter(!is.na(tone)) %>% select(row_id, tone)\n', 'rebuild');
      log('12 R: coded rows', r12.split('\n').filter((l) => /positive|negative/.test(l) && !/<-|filter|"/.test(l)));
      log('12 R: errors', r12.split('\n').filter((l) => /^Error/.test(l)));
      log('12 original CSV unchanged', Buffer.compare(before, fs.readFileSync(csv)) === 0);
      viewer.close();
      workbench.close();
    }

    // 7. MC 427: the Test menu heading says it checks Copilot's code (U2), and the tools are off (U3)
    const pick427 = vscode.commands.executeCommand('auraR.pickCourse');
    await choose(0);
    log('13 pick returned', (await pick427) ?? null);
    const t427 = menuTasks('mc427', true);
    const tweets = path.join(ws, 'tweets.R');
    fs.writeFileSync(tweets, '');
    editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(tweets), vscode.ViewColumn.One);
    const w427 = vscode.commands.executeCommand('auraR.writeCode');
    await sleep(1500);
    for (let i = 0; i < t427.indexOf('t-test'); i++) {
      await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext');
      await sleep(60);
    }
    await shot('13 MC 427 Write R code at the R4 Test heading', out);
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await choose(1); // Use the course example (code parity: Choose the table and the columns is first)
    await sleep(2500);
    await shot('14 MC 427 t-test inserted, with the cross-check reminder', out);
    await clearToasts();
    await w427;
    log('13 MC 427 t-test banner', editor.document.getText().split(/\r?\n/)[0]);
    log('14 MC 427 setup tool', (await invoke(names[0], {})).slice(0, 160));
    log('14 MC 427 test tool', (await invoke(names[2], { outcome: 'numeric', comparison: 'numeric', chosenTest: 'regression' })).slice(0, 160));
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
