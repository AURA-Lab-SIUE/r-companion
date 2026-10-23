// The 0.5.3 join suite (#rgui Rank 7), run inside a real VS Code by scripts/integration.mjs with
// AURA_IT_SUITE=test-integration/join.js and AURA_IT_CDP_PORT set.
//
// MC 451, an analysis.R that reads three CSV files: videos (video_id, channel, region, title),
// channels (channel, region, subscribers), and channels_dup (channels with one channel twice).
// 1. Join two tables by a shared column offers the tables the script made; the key list holds
//    exactly the columns both tables have (channel, region); the block lands at the cursor.
// 2. With channels_dup on the right, the repeat warning appears before anything is written.
// 3. The whole script runs in Rscript: the left join keeps the 4 video rows, the duplicate key
//    grows them to 6, and the anti_join check counts the 1 unmatched video.
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
    fs.writeFileSync(path.join(data, 'videos.csv'), 'video_id,channel,region,title\n1,a,us,First\n2,a,us,Second\n3,b,uk,Third\n4,z,us,Fourth\n');
    fs.writeFileSync(path.join(data, 'channels.csv'), 'channel,region,subscribers\na,us,100\nb,uk,250\n');
    fs.writeFileSync(path.join(data, 'channels-dup.csv'), 'channel,region,subscribers\na,us,100\na,us,120\nb,uk,250\n');

    const pick = vscode.commands.executeCommand('auraR.pickCourse');
    await choose(1);
    log('course', (await pick) ?? null);

    const analysisR = path.join(ws, 'analysis.R');
    fs.writeFileSync(analysisR, [
      'library(tidyverse)',
      'videos <- read_csv("data/videos.csv")',
      'channels <- read_csv("data/channels.csv")',
      'channels_dup <- read_csv("data/channels-dup.csv")',
      '',
      '',
    ].join('\n'));
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(analysisR), vscode.ViewColumn.One);
    const toEnd = () => {
      const last = editor.document.lineCount - 1;
      editor.selection = new vscode.Selection(last, 0, last, 0);
    };
    const index = menuTasks('mc451', true).indexOf('join-tables');
    log('menu offers join-tables', index >= 0);

    // 1
    toEnd();
    let p = vscode.commands.executeCommand('auraR.writeCode');
    await choose(index);
    await sleep(1000);
    log('1 left pick', await wb.eval(QUICK));
    await choose(0); // videos
    await sleep(1000);
    log('1 right pick', await wb.eval(QUICK));
    await choose(0); // channels
    await sleep(9000); // both column probes
    log('1 key pick', await wb.eval(QUICK));
    await choose(0); // channel
    await sleep(1000);
    log('1 how pick', await wb.eval(QUICK));
    await choose(0); // left_join
    await sleep(1500);
    await vscode.commands.executeCommand('notifications.clearAll'); // no Run it: Rscript runs the file below
    await p;
    log('1 block', editor.document.getText().includes('videos_channels <- videos %>%\n  left_join(channels, by = join_by(channel))'));

    // 2
    toEnd();
    p = vscode.commands.executeCommand('auraR.writeCode');
    await choose(index);
    await choose(0); // videos
    await sleep(1000);
    await choose(1); // channels_dup (videos is not offered on the right)
    await sleep(9000);
    await choose(0); // channel
    await sleep(2000);
    log('2 warning before writing', await wb.eval(TOASTS));
    const beforeWarning = editor.document.getText().includes('videos_channels_dup');
    await vscode.commands.executeCommand('notification.acceptPrimaryAction');
    await choose(0); // left_join
    await sleep(1500);
    await vscode.commands.executeCommand('notifications.clearAll');
    await p;
    log('2 nothing written before the warning was answered', !beforeWarning);
    log('2 block', editor.document.getText().includes('videos_channels_dup <- videos %>%\n  left_join(channels_dup, by = join_by(channel))'));

    // 3
    await editor.document.save();
    const r = cp.spawnSync(rscript, ['--vanilla', '-e', 'source("analysis.R", echo = TRUE, max.deparse.length = Inf)'], {
      cwd: ws, encoding: 'utf8', timeout: 180000, windowsHide: true,
    });
    const text = `${r.stdout}\n${r.stderr}`;
    log('3 Rscript exit', r.status);
    log('3 printed counts', (text.match(/^\[1\] \d+$/gm) || []));
    log('3 errors', text.split('\n').filter((l) => /^Error/.test(l)));
  } catch (e) {
    out.error = String((e && e.stack) || e);
  } finally {
    if (wb) wb.close();
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
