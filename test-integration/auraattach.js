// A1 attach toggle (0.7.5, #rgui), run inside a real VS Code by scripts/integration.mjs with
// AURA_IT_SUITE=test-integration/auraattach.js, vscode-R 3.4.0 preinstalled (AURA_IT_PREINSTALL_VSIX),
// and AURA_IT_CDP_PORT set so the screen can be read.
//
// One switch, AURA_IT_ATTACH:
//   0 = as shipped: a run key opens R (AURA), and nothing attaches it to vscode-R
//   1 = the candidate fix: once R (AURA) is up, ask vscode-R's public API for an attach command
//       (api.session.prepareAttachment(), vscode-R 3.4.0) and send it to R (AURA)
// Then the same student steps in both runs, and what each one shows is recorded:
//   - whether vscode-R reports a connected session, and the status bar text
//   - whether the Workspace view lists the table the student made
//   - where View(), a plot, and a help page open (VS Code tabs before and after, plus R's own
//     graphics device and help settings, written by R to a file)
//   - every notification on screen (vscode-R may ask before it installs its bundled sess)
// AURA_IT_SESS_PRESS names a button to press on a sess notification (first run: unset, to see it).
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

async function shot(file) {
  const port = process.env.AURA_IT_CDP_PORT;
  if (!port || !process.env.AURA_IT_SHOTS) return false;
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
      fs.writeFileSync(path.join(process.env.AURA_IT_SHOTS, file), Buffer.from(r.result.data, 'base64'));
      ws.close();
      return true;
    }
    ws.close();
  }
  return false;
}

const toasts = () => cdp("[...document.querySelectorAll('.notification-toast, .notifications-list-container .monaco-list-row')].map(function(e){return e.innerText.replace(/\\s+/g,' ');}).join(' || ')");
const statusR = () => cdp("[...document.querySelectorAll('.statusbar-item')].map(function(e){return e.innerText.trim();}).filter(function(s){return /^R[: ]/.test(s) || /R \\d/.test(s);}).join(' | ')");
const workspaceRows = () => cdp("(function(){var panes=[...document.querySelectorAll('.pane')].filter(function(p){var h=p.querySelector('.pane-header');return h&&/Workspace/i.test(h.innerText);});if(!panes.length)return 'no Workspace pane';return [...panes[0].querySelectorAll('.monaco-list-row')].map(function(r){return r.innerText.replace(/\\s+/g,' ');}).join(' || ')||'(empty)';})()");
const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label));
const terms = () => vscode.window.terminals.map((t) => ({ name: t.name, alive: t.exitStatus === undefined }));

async function pressButton(pattern, label) {
  return cdp(`(function(){var rows=[...document.querySelectorAll('.notification-toast, .notifications-list-container .monaco-list-row')].filter(function(e){return ${pattern}.test(e.innerText);});
    for (var r of rows){var b=[...r.querySelectorAll('a.monaco-button, .monaco-button')].find(function(x){return x.innerText.trim()===${JSON.stringify(label)};}); if(b){b.click();return b.innerText.trim();}}
    return 'none';})()`);
}

async function run() {
  const out = { steps: [], checks: [] };
  const t0 = Date.now();
  const flush = () => fs.writeFileSync(process.env.AURA_IT_OUT + '.partial', JSON.stringify(out, null, 2));
  const log = (name, value) => { out.steps.push({ name, value, ms: Date.now() - t0 }); flush(); };
  const attach = process.env.AURA_IT_ATTACH === '1';
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const fwd = (f) => path.join(ws, f).replace(/\\/g, '/');
  try {
    log('mode', attach ? 'attach via prepareAttachment' : 'as shipped');
    const comp = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await comp.activate();
    log('companion', comp.packageJSON.version);
    const rext = vscode.extensions.getExtension('REditorSupport.r');
    log('vscode-R', rext ? rext.packageJSON.version : 'not installed');
    const api = rext ? await rext.activate() : undefined;
    log('api.session keys', api && api.session ? Object.keys(api.session) : null);
    const events = [];
    if (api && api.session && typeof api.session.onDidChangeSessionConnection === 'function') {
      api.session.onDidChangeSessionConnection((e) => { events.push({ kind: e.kind, ms: Date.now() - t0 }); log('session event', e.kind); });
    }

    // The first-run walkthrough takes focus from the course pick (import suite, 2026-11-14)
    for (let t = 0; t < 5000 && !vscode.window.tabGroups.all.some((g) => g.tabs.some((x) => /Welcome|Walkthrough/.test(x.label))); t += 250) await sleep(250);
    await sleep(1500);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(1000);
    const pick = vscode.commands.executeCommand('auraR.pickCourse');
    // Press keys only once the course picker is on screen
    const pickerUp = "(function(){var w=document.querySelector('.quick-input-widget');if(!w||w.style.display==='none'||w.offsetParent===null)return '';return (w.querySelector('.quick-input-title')||{}).innerText||'shown';})()";
    let pickerSeen = 'not seen';
    for (let t = 0; t < 20000; t += 250) { if (/Which course/.test((await cdp(pickerUp)) || '')) { pickerSeen = 'seen'; break; } await sleep(250); }
    log('picker', pickerSeen);
    await choose(1); // MC 451
    log('pick course', await Promise.race([pick.then(() => 'done'), sleep(30000).then(() => 'pending')]));

    // Student step 1: a script with one line, run with the run key (no R terminal open yet)
    const script = path.join(ws, 'analysis.R');
    fs.writeFileSync(script, 'scores <- data.frame(id = 1:5, likes = c(3, 8, 2, 9, 4))\n');
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(script));
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    const p = vscode.commands.executeCommand('auraR.runInR');
    await Promise.race([p, sleep(60000)]);
    log('terminals after the run key', terms());
    const probe = fwd('probe.txt');
    const aura = vscode.window.terminals.find((t) => t.name === 'R (AURA)' && t.exitStatus === undefined);
    log('R (AURA) open', !!aura);
    // R answers once its prompt is back; the line is re-sent every 10 s until it does
    let answered = false;
    for (let i = 0, last = 0; i < 60 && !answered; i++) {
      if (aura && Date.now() - last > 10000) { aura.sendText(`writeLines(as.character(exists("scores")), "${probe}")`); last = Date.now(); }
      await sleep(1000);
      answered = fs.existsSync(path.join(ws, 'probe.txt'));
    }
    log('scores exists in R (AURA)', answered ? fs.readFileSync(path.join(ws, 'probe.txt'), 'utf8').trim() : 'no answer');
    await shot(`a1-${attach ? 'attach' : 'shipped'}-1-ran.png`);

    // The switch: send vscode-R's attach command to R (AURA)
    if (attach && aura) {
      if (!api || !api.session || typeof api.session.prepareAttachment !== 'function') {
        log('prepareAttachment', 'not in this vscode-R');
      } else {
        const a = await api.session.prepareAttachment();
        log('prepareAttachment returned', a ? { command: a.command.replace(/source\("(.*)\/([^/]+)"\)/, 'source(".../$2")') } : null);
        if (a) aura.sendText(a.command);
        const until = Date.now() + Number(process.env.AURA_IT_ATTACH_WAIT || 90000);
        let pressed = null; const seen = new Set();
        while (Date.now() < until && !events.some((e) => e.kind === 'connected')) {
          await sleep(1000);
          const t = await toasts();
          if (t && !seen.has(t)) { seen.add(t); log('notifications while attaching', t); await shot(`a1-attach-notice-${seen.size}.png`); }
          if (process.env.AURA_IT_SESS_PRESS && !pressed && t && /sess/i.test(t)) {
            const r = await pressButton('/sess/i', process.env.AURA_IT_SESS_PRESS);
            if (r && r !== 'none') { pressed = r; log('pressed', r); }
          }
        }
      }
    }
    await sleep(3000);
    log('session events', events);
    log('status bar R item', await statusR());
    out.checks.push({ name: 'vscode-R reports a connected session', ok: events.some((e) => e.kind === 'connected') });

    // Student step 2: look at the Workspace panel through the Companion's own panel item
    await vscode.commands.executeCommand('auraR.openWorkspaceView');
    await sleep(4000);
    const rows = await workspaceRows();
    log('Workspace view rows', rows);
    out.checks.push({ name: 'Workspace lists scores', ok: typeof rows === 'string' && /scores/.test(rows) });
    await shot(`a1-${attach ? 'attach' : 'shipped'}-2-workspace.png`);

    // Student steps 3 to 5: View(), a plot, a help page; R reports its own settings
    const where = fwd('where.txt');
    aura.sendText(`writeLines(c(paste("device:", paste(names(dev.cur()), collapse = ",")), paste("help_type:", format(getOption("help_type"))), paste("browser is a function:", is.function(getOption("browser"))), paste("viewer option:", !is.null(getOption("viewer"))), paste("sess loaded:", "sess" %in% loadedNamespaces())), "${where}")`);
    await sleep(3000);
    log('R settings before the views', fs.existsSync(path.join(ws, 'where.txt')) ? fs.readFileSync(path.join(ws, 'where.txt'), 'utf8').trim().split(/\r?\n/) : 'no answer');
    const views = {};
    for (const [label, line] of [['View', 'View(scores)'], ['plot', 'plot(scores$id, scores$likes)'], ['help', '?mean']]) {
      const before = tabs();
      aura.sendText(line);
      await sleep(8000);
      const after = tabs();
      views[label] = { newTabs: after.filter((t) => !before.includes(t)), notifications: await toasts() };
      log(`after ${line}`, views[label]);
      await shot(`a1-${attach ? 'attach' : 'shipped'}-3-${label}.png`);
    }
    aura.sendText(`writeLines(paste("device:", paste(names(dev.cur()), collapse = ",")), "${fwd('device.txt')}")`);
    await sleep(3000);
    log('graphics device after the plot', fs.existsSync(path.join(ws, 'device.txt')) ? fs.readFileSync(path.join(ws, 'device.txt'), 'utf8').trim() : 'no answer');
    log('terminals at end', terms());
  } catch (e) {
    out.error = String(e && e.stack || e);
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
