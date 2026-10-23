// The 0.5.3 error-catalog suite (#rgui Rank 3), run inside a real VS Code by scripts/integration.mjs
// with AURA_IT_SUITE=test-integration/fixit.js and AURA_IT_PREINSTALL_VSIX set to vscode-R 2.8.8,
// the last release before the R 4.6 attach fix.
//
// 1. Check my setup (MC 427) reads vscode-R's version: 2.8.8 is NEEDS UPDATE and SETUP OK never prints.
// 2. Explain an R error recognizes the not-attached and ECONNRESET texts (command API, no UI).
// 3. Fix it, bracketed paste: a .vscode/settings.json with a comment above "r.bracketedPaste": true
//    and another setting below it. After the fix the value is false and every other line is
//    byte-identical.
// 4. Fix it, Update the R extension: installs the newest vscode-R from the gallery; the folder on
//    disk is the evidence, since the running copy reports its old version until the window reloads.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const out = { steps: [] };
  const log = (name, value) => out.steps.push({ name, value });
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  try {
    const ext = vscode.extensions.getExtension('aura-lab-siue.r-companion');
    await ext.activate();
    log('version', ext.packageJSON.version);
    const r = vscode.extensions.getExtension('REditorSupport.r');
    log('vscode-R installed', r ? r.packageJSON.version : null);

    // 1
    const check = await vscode.commands.executeCommand('auraR.checkSetup', { course: 'mc427', silent: true });
    const item = check.items.find((i) => i.name === 'R extension for VS Code');
    log('1 R extension line', item ? { status: item.status, detail: item.detail } : null);
    log('1 report says NEEDS UPDATE, never SETUP OK', {
      needsUpdate: /\[NEEDS UPDATE\] R extension for VS Code/.test(check.text),
      setupOk: check.text.includes('SETUP OK'),
    });

    // 2
    for (const msg of ['R: (not attached)', 'Connection to server got closed. Server will not be restarted.', 'Client R Language Server: read ECONNRESET']) {
      log(`2 explain: ${msg}`, await vscode.commands.executeCommand('auraR.explainError', msg));
    }

    // 3
    const dir = path.join(ws, '.vscode');
    fs.mkdirSync(dir, { recursive: true });
    const settings = path.join(dir, 'settings.json');
    const before = [
      '{',
      '  // Course template settings (copied before 2026-09-08)',
      '  "r.bracketedPaste": true,',
      '  "r.sessionWatcher": true,',
      '  "files.trimTrailingWhitespace": true',
      '}',
      '',
    ].join('\n');
    fs.writeFileSync(settings, before);
    await sleep(3000); // VS Code reads the new file
    log('3 before: r.bracketedPaste', vscode.workspace.getConfiguration('r').get('bracketedPaste'));
    log('3 fix', await vscode.commands.executeCommand('auraR.fixIt', 'turn-off-bracketed-paste'));
    await sleep(1500);
    const after = fs.readFileSync(settings, 'utf8');
    const a = before.split('\n');
    const b = after.split('\n');
    log('3 after: the file', after);
    log('3 after: r.bracketedPaste', vscode.workspace.getConfiguration('r').get('bracketedPaste'));
    log('3 untouched lines byte-identical', {
      comment: b.includes(a[1]),
      sessionWatcher: b.some((l) => l.trim().startsWith('"r.sessionWatcher": true')),
      trim: b.some((l) => l.trim().startsWith('"files.trimTrailingWhitespace": true')),
      valueFalse: /"r\.bracketedPaste":\s*false/.test(after),
    });

    // 4
    const extDir = process.env.AURA_IT_EXT_DIR;
    const listR = () => (fs.existsSync(extDir) ? fs.readdirSync(extDir).filter((d) => /^reditorsupport\.r-\d/i.test(d)) : []);
    log('4 vscode-R folders before', listR());
    const p = vscode.commands.executeCommand('auraR.fixIt', 'update-r-extension');
    await sleep(60000);
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    log('4 fix returned', await Promise.race([p, sleep(5000).then(() => 'still running')]));
    log('4 vscode-R folders after', listR());
    log('4 running copy reports', vscode.extensions.getExtension('REditorSupport.r')?.packageJSON.version ?? null);
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
