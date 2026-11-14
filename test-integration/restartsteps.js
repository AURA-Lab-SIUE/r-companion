// A4 Restart R and run my steps (0.7.5, #rgui), run inside a real VS Code by scripts/integration.mjs
// with AURA_IT_SUITE=test-integration/restartsteps.js and AURA_IT_CDP_PORT set (the confirm is a
// modal dialog, pressed through the DevTools port).
//
// The student case: analysis.R uses y, which the student typed only at the R prompt.
//   1 Run my steps from the top, with y typed at the prompt: the script runs (the hidden step hides)
//   2 Restart R and run my steps, Cancel: nothing closes, nothing runs
//   3 Restart R and run my steps, confirm: a new R (AURA), y is gone, the script stops before its last line
//   4 the script fixed to make y itself, Restart R and run my steps: it runs to the end
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

const dialogText = () => cdp("(function(){var d=document.querySelector('.monaco-dialog-box');return d?d.innerText.replace(/\\s+/g,' '):'';})()");
const pressDialog = (label) =>
  cdp(`(function(){var d=document.querySelector('.monaco-dialog-box');if(!d)return 'no dialog';var b=[...d.querySelectorAll('.monaco-button')].find(function(x){return x.innerText.trim()===${JSON.stringify(label)};});if(!b)return 'no button: '+[...d.querySelectorAll('.monaco-button')].map(function(x){return x.innerText.trim();}).join('|');b.click();return 'pressed';})()`);
const auraTerms = () => vscode.window.terminals.filter((t) => t.name === 'R (AURA)' && t.exitStatus === undefined);
// With vscode-R installed, Open an R terminal opens vscode-R's own R terminal, not R (AURA)
const rTerms = () => vscode.window.terminals.filter((t) => (t.name === 'R (AURA)' || /^R( Interactive)?$/.test(t.name)) && t.exitStatus === undefined);
const pickerTitle = () =>
  cdp("(function(){var w=document.querySelector('.quick-input-widget');if(!w||w.style.display==='none'||w.offsetParent===null)return '';return (w.querySelector('.quick-input-title')||{}).innerText||'shown';})()");

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
  const fwd = (f) => path.join(ws, f).replace(/\\/g, '/');
  const file = (f) => path.join(ws, f);
  const read = (f) => (fs.existsSync(file(f)) ? fs.readFileSync(file(f), 'utf8').trim() : null);
  // R answers once its prompt is back; the line is re-sent every 10 s until it does
  const ask = async (term, expr, f) => {
    fs.rmSync(file(f), { force: true });
    for (let i = 0, last = 0; i < 60; i++) {
      if (Date.now() - last > 10000) { term.sendText(`writeLines(as.character(${expr}), "${fwd(f)}")`); last = Date.now(); }
      await sleep(1000);
      if (fs.existsSync(file(f))) return read(f);
    }
    return 'no answer';
  };
  try {
    const comp = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await comp.activate();
    log('companion', comp.packageJSON.version);
    // The first-run walkthrough takes focus from the course pick (import suite, 2026-11-14)
    await waitFor(() => vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => /Welcome|Walkthrough/.test(t.label))), 5000);
    await sleep(1500);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(1000);
    const pick = vscode.commands.executeCommand('auraR.pickCourse');
    // Press keys only once the course picker is on screen (import suite, 2026-10-23)
    log('picker', (await waitFor(async () => (/Which course/.test((await pickerTitle()) || '') ? 'seen' : undefined), 20000)) ?? 'not seen');
    await choose(1); // MC 451
    log('pick course', await Promise.race([pick.then((c) => c ?? 'none'), sleep(30000).then(() => 'pending')]));
    

    const script = file('analysis.R');
    fs.writeFileSync(script, `x <- y + 1\nwriteLines(as.character(x), "${fwd('ran-to-end.txt')}")\n`);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(script));

    // 1: y typed at the prompt only, then Run my steps from the top
    await vscode.commands.executeCommand('auraR.openRTerminal');
    const first = await waitFor(() => rTerms()[0], 60000);
    log('1 R terminal open', first ? first.name : false);
    if (!first) throw new Error('no R terminal');
    log('1 R answers', await ask(first, 'TRUE', 'ready.txt'));
    first.sendText('y <- 1');
    await sleep(1500);
    const firstPid = await first.processId;
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(script));
    await vscode.commands.executeCommand('auraR.runSteps');
    log('1 Run my steps: ran to the end', (await waitFor(() => read('ran-to-end.txt'), 60000)) ?? 'no');

    // 2: VS Code refuses modal dialogs under its test runner, so Cancel cannot be pressed here.
    // Without the token the command must stop at the confirm: the refusal names its text, and
    // nothing closes or runs.
    fs.rmSync(file('ran-to-end.txt'), { force: true });
    let refused = 'no refusal';
    try { await vscode.commands.executeCommand('auraR.restartAndRunSteps'); } catch (e) { refused = String(e && e.message ? e.message : e).slice(0, 220); }
    log('2 the confirm is asked first', refused);
    await sleep(3000);
    log('2 same R terminal still open', first.exitStatus === undefined && (await first.processId) === firstPid);
    log('2 nothing ran', read('ran-to-end.txt') === null);
    log('2 y still in R', await ask(first, 'exists("y")', 'y-2.txt'));

    // 3: confirm the restart: a fresh R, so the script stops at its first line
    // The token stands in for clicking Restart R and run (src/menus.ts RESTART_CONFIRMED)
    const restarted = vscode.commands.executeCommand('auraR.restartAndRunSteps', 'aura-it-restart-confirmed');
    log('3 command', await Promise.race([restarted.then(() => 'done', (e) => 'error: ' + e), sleep(90000).then(() => 'pending')]));
    const fresh = await waitFor(async () => {
      const t = auraTerms()[0];
      return t && (await t.processId) !== firstPid ? t : undefined;
    }, 60000);
    log('3 a new R (AURA)', !!fresh);
    log('3 R terminals open', rTerms().map((t) => t.name));
    log('3 the old R terminal closed', first.exitStatus !== undefined);
    await sleep(8000);
    log('3 y in the fresh R', fresh ? await ask(fresh, 'exists("y")', 'y-3.txt') : 'no R');
    log('3 x in the fresh R', fresh ? await ask(fresh, 'exists("x")', 'x-3.txt') : 'no R');
    log('3 ran to the end', read('ran-to-end.txt') === null ? 'no' : 'yes');

    // 4: the fixed script makes y itself, so the restart run reaches its last line
    fs.writeFileSync(script, `y <- 1\nx <- y + 1\nwriteLines(as.character(x), "${fwd('ran-to-end.txt')}")\n`);
    const doc = await vscode.workspace.openTextDocument(script);
    await vscode.window.showTextDocument(doc);
    await sleep(1000);
    const fixedPid = fresh ? await fresh.processId : undefined;
    const again = vscode.commands.executeCommand('auraR.restartAndRunSteps', 'aura-it-restart-confirmed');
    log('4 command', await Promise.race([again.then(() => 'done', (e) => 'error: ' + e), sleep(90000).then(() => 'pending')]));
    log('4 ran to the end', (await waitFor(() => read('ran-to-end.txt'), 90000)) ?? 'no');
    const last = auraTerms()[0];
    log('4 a new R again', !!last && (await last.processId) !== fixedPid);
  } catch (e) {
    log('error', String(e && e.stack ? e.stack : e));
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
