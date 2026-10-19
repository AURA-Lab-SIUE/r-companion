// "Run it" with no R terminal open (0.4.1 must-fix, #rgui), in a real VS Code with the R extension
// (vscode-R) installed, as every VS Code course requires. Run by scripts/integration.mjs with
// AURA_IT_SUITE=test-integration/runit.js; vscode-R is installed into the scratch profile before
// launch (AURA_IT_PREINSTALL_VSIX), so it is there at startup the way a student has it.
//
// A fresh window with no terminal: pick MC 451, write "Load the course Twitch corpus" into a new
// script, and press the notification's "Run it". The block must reach R: after it, a probe line
// sent to each R terminal writes exists("chat") to a file, and some terminal must answer TRUE.
// Then a second block (a count) goes through Run it with R already open, and must land in the
// same R session. Records the terminals that exist and any notifications vscode-R raised.
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

async function cdpShot(file) {
  const port = process.env.AURA_IT_CDP_PORT;
  if (!port) return false;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  for (const t of targets.filter((x) => x.type === 'page')) {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
    const isWb = await send('Runtime.evaluate', { expression: "!!document.querySelector('.monaco-workbench')", returnByValue: true });
    if (isWb.result && isWb.result.result && isWb.result.result.value === true) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      ws.close();
      return true;
    }
    ws.close();
  }
  return false;
}

async function run() {
  const out = { steps: [], checks: [] };
  // Written after every step, so a hang still leaves a trail
  const flush = () => fs.writeFileSync(process.env.AURA_IT_OUT + '.partial', JSON.stringify(out, null, 2));
  const log = (name, value) => { out.steps.push({ name, value, t: new Date().toISOString() }); flush(); };
  // A command that never returns (vscode-R waiting on a prompt) is recorded, not waited on forever
  const within = (promise, ms, what) => { let done = false; promise.then(() => { done = true; }, () => { done = true; }); return Promise.race([promise, sleep(ms).then(async () => {
    if (done) return promise;
    log(`${what}: still pending after ${ms} ms`, terms());
    if (shots) await cdpShot(path.join(shots, `runit-pending-${what.replace(/\W+/g, '-')}.png`));
    log('notifications', await toastText());
    return 'pending';
  })]); };
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, ...(ok ? {} : { detail }) });
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const shots = process.env.AURA_IT_SHOTS;
  const toastText = async () => {
    const port = process.env.AURA_IT_CDP_PORT;
    if (!port) return null;
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    for (const t of targets.filter((x) => x.type === 'page')) {
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      const r = await new Promise((res) => { ws.onmessage = (ev) => res(JSON.parse(ev.data)); ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "document.querySelector('.monaco-workbench') ? [...document.querySelectorAll('.notification-toast')].map(function(e){return e.innerText.replace(/\s+/g,' ');}).join(' || ') : null", returnByValue: true } })); });
      ws.close();
      const v = r.result && r.result.result && r.result.result.value;
      if (v !== null && v !== undefined) return v;
    }
    return null;
  };
  // The quick pick on screen, if any (vscode-R 3.3 asks "Run R code: Choose where to run" when
  // no R session exists). AURA_IT_VSCODER_PICK picks its answer: 1 = Create R terminal (default).
  const quickInput = async () => {
    const port = process.env.AURA_IT_CDP_PORT;
    if (!port) return null;
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    for (const t of targets.filter((x) => x.type === 'page')) {
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      const r = await new Promise((res) => { ws.onmessage = (ev) => res(JSON.parse(ev.data)); ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "(function(){if(!document.querySelector('.monaco-workbench'))return null;var w=document.querySelector('.quick-input-widget');if(!w||w.style.display==='none'||!w.offsetParent)return '';return w.innerText.replace(/\s+/g,' ');})()", returnByValue: true } })); });
      ws.close();
      const v = r.result && r.result.result && r.result.result.value;
      if (v !== null && v !== undefined) return v;
    }
    return null;
  };
  const answerVscodeRPick = async (label) => {
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      const q = await quickInput();
      if (q && /Run R code/.test(q)) {
        log(`${label}: vscode-R asked`, q);
        if (shots) await cdpShot(path.join(shots, `runit-vscode-r-pick-${label.replace(/\W+/g, '-')}.png`));
        await choose(Number(process.env.AURA_IT_VSCODER_PICK || 1));
        return true;
      }
    }
    return false;
  };
  const terms = () => vscode.window.terminals.map((t) => ({ name: t.name, alive: t.exitStatus === undefined }));
  try {
    const ext = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await ext.activate();
    log('version', ext.packageJSON.version);
    log('vscode-R installed', !!vscode.extensions.getExtension('REditorSupport.r'));
    log('adapter', (await vscode.commands.executeCommand('auraR.diagnostics')).adapter);
    log('terminals at start', terms());
    check('fresh window: no terminal open', vscode.window.terminals.length === 0, terms());

    const pick = vscode.commands.executeCommand('auraR.pickCourse');
    await choose(1); // MC 451
    log('pick course', await within(pick, 30000, 'pick course'));
    const { menuTasks } = require(path.join(ext.extensionPath, 'out', 'src', 'menus.js'));
    const tasks = menuTasks('mc451', true);

    const script = path.join(ws, 'analysis.R');
    fs.writeFileSync(script, '# Run it check\n');
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(script));
    editor.selection = new vscode.Selection(1, 0, 1, 0);

    const t0 = Date.now();
    const p = vscode.commands.executeCommand('auraR.writeCode');
    await choose(tasks.indexOf('import-course-dataset'));
    await sleep(1500);
    await vscode.commands.executeCommand('notification.acceptPrimaryAction'); // "Run it"
    log('first Run it: vscode-R pick answered', await answerVscodeRPick('first Run it'));
    log('Run it result', await within(p, 90000, 'first Run it'));
    log('Run it returned after ms', Date.now() - t0);
    log('terminals after Run it', terms());

    // Give R time to load the tidyverse and the corpus, then ask every R terminal whether chat exists
    await sleep(25000);
    if (shots) await cdpShot(path.join(shots, 'runit-1-after-first-block.png'));
    const rTerms = vscode.window.terminals.filter((t) => t.exitStatus === undefined && /^R\b/.test(t.name));
    rTerms.forEach((t, i) => t.sendText(`writeLines(as.character(exists("chat")), "probe-${i}.txt")`, true));
    await sleep(8000);
    const probes = rTerms.map((t, i) => {
      const f = path.join(ws, `probe-${i}.txt`);
      return { terminal: t.name, answer: fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : 'no file' };
    });
    log('probes', probes);
    check('the first block reached R: chat exists in an R terminal', probes.some((x) => x.answer === 'TRUE'), probes);
    check('exactly one R terminal was opened', rTerms.length === 1, terms());

    // A second block with R already running: it must land in the same session
    const before = vscode.window.terminals.length;
    editor.selection = new vscode.Selection(editor.document.lineCount, 0, editor.document.lineCount, 0);
    const p2 = vscode.commands.executeCommand('auraR.writeCode');
    await choose(tasks.indexOf('count'));
    await sleep(1500);
    for (let i = 0; i < 3; i++) {
      await sleep(800);
      // A column pick may come first: take the first offer, then "Run it"
      await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    }
    await sleep(1500);
    await vscode.commands.executeCommand('notification.acceptPrimaryAction');
    log('second Run it: vscode-R pick answered', await answerVscodeRPick('second Run it'));
    log('second Run it result', await within(p2, 60000, 'second Run it'));
    await sleep(6000);
    const r2 = vscode.window.terminals.filter((t) => t.exitStatus === undefined && /^R\b/.test(t.name));
    r2.forEach((t, i) => t.sendText(`writeLines(as.character(exists("chat") && nrow(chat) > 0), "probe2-${i}.txt")`, true));
    await sleep(5000);
    const probes2 = r2.map((t, i) => {
      const f = path.join(ws, `probe2-${i}.txt`);
      return { terminal: t.name, answer: fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : 'no file' };
    });
    log('second block terminals', terms());
    log('probes after second block', probes2);
    check('the second block used the same R terminal (no new terminal)', vscode.window.terminals.length === before, { before, now: terms() });
    if (shots) await cdpShot(path.join(shots, 'runit-2-after-second-block.png'));
    log('script after both blocks (first lines)', editor.document.getText().split(/\r?\n/).slice(0, 4));
  } catch (e) {
    log('ERROR', String((e && e.stack) || e));
  }
  out.passed = out.checks.filter((c) => c.ok).length;
  out.total = out.checks.length;
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
