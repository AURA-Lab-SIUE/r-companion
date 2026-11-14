// The White Paper walk (0.7.5, #rgui task 3), run inside a real VS Code by scripts/integration.mjs
// with AURA_IT_SUITE=test-integration/paperwalk.js, vscode-R and quarto.quarto preinstalled, and
// AURA_IT_CDP_PORT set (the project name is typed into an input box through the DevTools port).
//
// A MC 451 student in their course workspace, following worksheet 14 with the Companion:
//   1 Create my White Paper project (Run it): the nested project with _quarto.yml and data/derived
//   2 Point R at my White Paper project (Run it): project is set in R and file.exists is TRUE
//   3 worksheet Step 4 (copy the RDS into the project) and Step 6 (the setup chunk in 03-results.qmd)
//   4 Run Cell on the Step 6 setup chunk: R runs in the workspace, so does the chapter's path load?
//   5 Load your saved analysis (RDS) with the cursor in 03-results.qmd: which path does it write?
//   6 Insert a number from R, in a sentence and inside a chunk
//   7 Render this document on 03-results.qmd: does docs/03-results.html appear?
//   8 Render this document on codebook/codebook.qmd that reads data/: which warning shows?
//   9 Publish my White Paper site: the block is inserted and NOT run (it would publish)
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms, step = 250) {
  for (let t = 0; t < ms; t += step) {
    const v = await fn();
    if (v) return v;
    await sleep(step);
  }
  return undefined;
}

async function cdp(expression) {
  const port = process.env.AURA_IT_CDP_PORT;
  if (!port) return null;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  for (const t of targets.filter((x) => x.type === 'page')) {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const r = await new Promise((res) => {
      ws.onmessage = (ev) => res(JSON.parse(ev.data));
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `document.querySelector('.monaco-workbench') ? (${expression}) : null`, returnByValue: true } }));
    });
    ws.close();
    const v = r.result && r.result.result && r.result.result.value;
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

const pickerTitle = () =>
  cdp("(function(){var w=document.querySelector('.quick-input-widget');if(!w||w.style.display==='none'||w.offsetParent===null)return '';return (w.querySelector('.quick-input-title')||{}).innerText||'shown';})()");
const typeInPicker = (text) =>
  cdp(`(function(){var i=document.querySelector('.quick-input-widget input');if(!i)return 'no input';i.focus();i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';})()`);
const toasts = () =>
  cdp("[...document.querySelectorAll('.notification-toast .notification-list-item-message')].map(function(e){return e.innerText.replace(/\\s+/g,' ');}).join(' || ')");
const rTerms = () => vscode.window.terminals.filter((t) => (t.name === 'R (AURA)' || /^R( Interactive)?$/.test(t.name)) && t.exitStatus === undefined);

async function choose(down) {
  await sleep(1500);
  for (let i = 0; i < down; i++) {
    await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext');
    await sleep(120);
  }
  await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
}

async function run() {
  const out = { steps: [] };
  const t0 = Date.now();
  const flush = () => fs.writeFileSync(process.env.AURA_IT_OUT + '.partial', JSON.stringify(out, null, 2));
  const log = (name, value) => { out.steps.push({ name, value, ms: Date.now() - t0 }); flush(); };
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const file = (...f) => path.join(ws, ...f);
  const fwd = (...f) => file(...f).replace(/\\/g, '/');
  const read = (...f) => (fs.existsSync(file(...f)) ? fs.readFileSync(file(...f), 'utf8').trim() : null);
  const ask = async (term, expr, f) => {
    fs.rmSync(file(f), { force: true });
    for (let i = 0, last = 0; i < 60; i++) {
      if (Date.now() - last > 10000) { term.sendText(`writeLines(as.character(${expr}), "${fwd(f)}")`); last = Date.now(); }
      await sleep(1000);
      if (fs.existsSync(file(f))) return read(f);
    }
    return 'no answer';
  };
  const R = () => rTerms()[0];
  const project = 'twitch-portfolio';
  const open = async (...f) => vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file(...f)), { preview: false });
  const cursorAt = (ed, needle, after = true) => {
    const i = ed.document.getText().indexOf(needle);
    const pos = ed.document.positionAt(i + (after ? needle.length : 0));
    ed.selection = new vscode.Selection(pos, pos);
  };
  const runToast = async () => {
    const seen = await waitFor(async () => { const t = await toasts(); return /Run it now\?/.test(t || '') ? t : undefined; }, 15000);
    if (seen) await vscode.commands.executeCommand('notification.acceptPrimaryAction');
    return seen || 'no Run it question';
  };
  try {
    const comp = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await comp.activate();
    log('companion', comp.packageJSON.version);
    log('quarto.quarto', vscode.extensions.getExtension('quarto.quarto') ? vscode.extensions.getExtension('quarto.quarto').packageJSON.version : 'not installed');
    await waitFor(() => vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => /Welcome|Walkthrough/.test(t.label))), 5000);
    await sleep(1500);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(1000);
    const pick = vscode.commands.executeCommand('auraR.pickCourse');
    log('picker', (await waitFor(async () => (/Which course/.test((await pickerTitle()) || '') ? 'seen' : undefined), 20000)) ?? 'not seen');
    await choose(1); // MC 451
    log('pick course', await Promise.race([pick.then((c) => c ?? 'none'), sleep(30000).then(() => 'pending')]));

    // The workspace a student has by worksheet 14: data/twitch_analysis.RDS from Data Wrangling,
    // a data/derived folder from the coding snapshots, and the worksheet open at the top
    fs.mkdirSync(file('data', 'derived'), { recursive: true });
    fs.writeFileSync(file('14-publishing-your-paper.qmd'), '---\ntitle: "Publishing your paper"\n---\n\n## Step 2\n\nStudent work goes here.\n');
    await vscode.commands.executeCommand('auraR.openRTerminal');
    log('R terminal', (await waitFor(() => R(), 60000))?.name ?? 'none');
    log('R answers', await ask(R(), 'TRUE', 'ready.txt'));
    R().sendText(`saveRDS(data.frame(channel_type = c("gaming", "just chatting", NA), message_length = c(12, 40, 7)), "${fwd('data', 'twitch_analysis.RDS')}")`);
    await waitFor(() => fs.existsSync(file('data', 'twitch_analysis.RDS')), 20000);
    log('seeded data/twitch_analysis.RDS', fs.existsSync(file('data', 'twitch_analysis.RDS')));

    // 1 Create my White Paper project
    let ed = await open('14-publishing-your-paper.qmd');
    cursorAt(ed, 'Student work goes here.\n');
    const made = vscode.commands.executeCommand('auraR.newPortfolio');
    log('1 name box', (await waitFor(async () => (await pickerTitle()) || undefined, 15000)) ?? 'no box');
    log('1 type name', await typeInPicker(project));
    await sleep(500);
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    log('1 Run it question', await runToast());
    await Promise.race([made, sleep(60000)]);
    const yml = await waitFor(() => fs.existsSync(file(project, '_quarto.yml')), 120000, 1000);
    log('1 project made', {
      quartoYml: !!yml,
      derived: fs.existsSync(file(project, 'data', 'derived')),
      results: fs.existsSync(file(project, '03-results.qmd')),
      rproj: fs.readdirSync(file(project)).filter((f) => f.endsWith('.Rproj')),
    });
    log('1 block in the worksheet', ed.document.getText().includes(`v2v::new_portfolio(project)`) && ed.document.getText().includes('```{r}'));
    log('1 R wd after create', await ask(R(), 'getwd()', 'wd-1.txt'));

    // 2 Point R at my White Paper project
    ed = await open('14-publishing-your-paper.qmd');
    cursorAt(ed, ed.document.getText(), true);
    const point = vscode.commands.executeCommand('auraR.pointAtProject');
    log('2 Run it question', await runToast());
    await Promise.race([point, sleep(30000)]);
    await sleep(3000);
    log('2 project in R', await ask(R(), 'if (exists("project")) project else "missing"', 'project-2.txt'));
    log('2 _quarto.yml found from R', await ask(R(), 'file.exists(file.path(project, "_quarto.yml"))', 'found-2.txt'));

    // 3 worksheet Steps 4 and 6, as the student runs and pastes them
    R().sendText('file.copy(from = "data/twitch_analysis.RDS", to = file.path(project, "data", "derived"), overwrite = TRUE)');
    await waitFor(() => fs.existsSync(file(project, 'data', 'derived', 'twitch_analysis.RDS')), 20000);
    log('3 Step 4 copied', fs.existsSync(file(project, 'data', 'derived', 'twitch_analysis.RDS')));
    const results = file(project, '03-results.qmd');
    const setup = '```{r}\n#| label: setup\n#| include: false\nlibrary(tidyverse)\nlibrary(v2v)\nanalysis <- read_rds("data/derived/twitch_analysis.RDS")\n```\n';
    const sentence = 'The analysis dataset held `r format(nrow(analysis), big.mark = ",")` messages.\n';
    fs.writeFileSync(results, fs.readFileSync(results, 'utf8') + '\n' + setup + '\n' + sentence + '\nNEXT SENTENCE HERE.\n');
    log('3 Step 6 setup chunk pasted', true);

    // 4 Run Cell on the setup chunk (the chunk's Run Cell button runs quarto.runCurrentCell)
    R().sendText('if (exists("analysis")) rm(analysis)');
    await sleep(1500);
    ed = await open(project, '03-results.qmd');
    cursorAt(ed, 'library(v2v)\n');
    let cell = 'ran';
    try { await vscode.commands.executeCommand('quarto.runCurrentCell'); } catch (e) { cell = 'error: ' + String(e && e.message ? e.message : e).slice(0, 200); }
    log('4 Run Cell', cell);
    await sleep(12000);
    log('4 analysis loaded by Run Cell', await ask(R(), 'exists("analysis")', 'cell-4.txt'));
    log('4 the chunk ran: tidyverse attached', await ask(R(), '"package:tidyverse" %in% search()', 'tv-4.txt'));
    log('4 the last R error', await ask(R(), 'gsub("[[:space:]]+", " ", geterrmessage())', 'err-4.txt'));
    log('4 R wd during Run Cell', await ask(R(), 'getwd()', 'wd-4.txt'));
    log('4 the chapter path from the R wd', await ask(R(), 'file.exists("data/derived/twitch_analysis.RDS")', 'path-4.txt'));
    log('4 toasts', await toasts());

    // 5 Load your saved analysis (RDS) with the cursor in the chapter
    ed = await open(project, '03-results.qmd');
    cursorAt(ed, 'NEXT SENTENCE HERE.\n');
    const before5 = ed.document.getText();
    const load = vscode.commands.executeCommand('auraR.writeCode', 'import-rds');
    await sleep(2500);
    log('5 picker', (await pickerTitle()) || 'no picker');
    if (await pickerTitle()) await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await sleep(2500);
    log('5 toasts', await toasts());
    await vscode.commands.executeCommand('notifications.clearAll');
    await Promise.race([load, sleep(10000)]);
    const added5 = ed.document.getText().slice(before5.length - 'NEXT SENTENCE HERE.\n'.length);
    log('5 read line written', (ed.document.getText().match(/read_rds\("[^"]*"\)/g) || []));
    log('5 block', added5.slice(0, 600));
    await vscode.commands.executeCommand('workbench.action.files.revert');
    fs.writeFileSync(results, before5);
    await sleep(1000);

    // 6 Insert a number from R: in a sentence, then inside the setup chunk
    ed = await open(project, '03-results.qmd');
    cursorAt(ed, 'NEXT SENTENCE HERE.', false);
    await vscode.commands.executeCommand('auraR.insertInlineR');
    await sleep(800);
    log('6 in a sentence', ed.document.lineAt(ed.selection.active.line).text);
    await vscode.commands.executeCommand('workbench.action.files.save');
    cursorAt(ed, 'library(v2v)\n');
    await vscode.commands.executeCommand('auraR.insertInlineR');
    await sleep(1500);
    log('6 inside a chunk', await toasts());
    await vscode.commands.executeCommand('notifications.clearAll');
    fs.writeFileSync(results, before5);
    await sleep(1000);

    // 7 Render this document on the chapter
    ed = await open(project, '03-results.qmd');
    await vscode.commands.executeCommand('workbench.action.files.revert');
    const html = () => ['docs', '_book'].map((d) => file(project, d, '03-results.html')).find((p) => fs.existsSync(p));
    const r7 = vscode.commands.executeCommand('auraR.renderDocument');
    await sleep(3000);
    log('7 toasts at render', await toasts());
    await Promise.race([r7, sleep(10000)]);
    const built = await waitFor(() => html(), 240000, 2000);
    log('7 rendered html', built ? path.relative(ws, built) : 'none after 4 min');
    log('7 the sentence in the html', built ? (fs.readFileSync(built, 'utf8').match(/dataset held[^<]{0,40}/) || ['not found'])[0] : null);
    log('7 terminals', vscode.window.terminals.map((t) => t.name));

    // 8 Render this document on a chapter in a subfolder of the project that reads data/
    const codebook = file(project, 'codebook', 'codebook.qmd');
    fs.writeFileSync(codebook, fs.readFileSync(codebook, 'utf8') + '\n```{r}\nlibrary(tidyverse)\ncodes <- read_rds("data/derived/twitch_analysis.RDS")\n```\n');
    ed = await open(project, 'codebook', 'codebook.qmd');
    const r8 = vscode.commands.executeCommand('auraR.renderDocument');
    log('8 warning', (await waitFor(async () => { const t = await toasts(); return t ? t : undefined; }, 10000)) ?? 'no warning');
    await vscode.commands.executeCommand('notifications.clearAll');
    await Promise.race([r8, sleep(5000)]);

    // 9 Publish my White Paper site: insert only, never run
    ed = await open('14-publishing-your-paper.qmd');
    cursorAt(ed, ed.document.getText(), true);
    const pub = vscode.commands.executeCommand('auraR.deployPortfolio');
    const q9 = await waitFor(async () => { const t = await toasts(); return /Run it now\?/.test(t || '') ? t : undefined; }, 15000);
    log('9 Run it question (not pressed)', q9 ?? 'none');
    await vscode.commands.executeCommand('notifications.clearAll');
    await Promise.race([pub, sleep(5000)]);
    log('9 block inserted', ed.document.getText().includes('v2v::deploy_portfolio(project)'));
    log('9 project lines in the worksheet', (ed.document.getText().match(/project <- "[^"]*"/g) || []));
  } catch (e) {
    log('error', String(e && e.stack ? e.stack : e));
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
