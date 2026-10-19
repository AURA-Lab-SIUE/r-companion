// Get Started ticks, checked on the real page (scripts/integration.mjs runs it with
// AURA_IT_SUITE=test-integration/walkthrough.js). Screenshots are the evidence: the context keys
// the extension sets are not the tick, VS Code's walkthrough service decides that.
//   AURA_IT_INSTALL_VSIX  a built .vsix: installed into the running window, the way a student
//                         installs from the Marketplace; unset, the extension loads at startup
//   AURA_IT_INSTALL_CLI=1 install it from a separate `code --install-extension` process instead
//                         (the route the R1 video recordings used)
//   AURA_IT_SEED          set by the harness when the workspace holds mc427-setup-check.R, so the
//                         course is already detected before any pick
//   AURA_IT_QUICK=1       stop after the course pick (the toggle runs)
// The workspace is a folder, so "Open your course workspace" should be ticked from shot 1 on.
// Shots: 1 before any action, 2 after a cancelled pick, 3 after picking MC 427, then (full run)
// 4 setup check with the R extension missing, 5 after it passes, 6 after the help list.
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const EXT = 'aura-lab-siue.r-companion';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const diag = () => vscode.commands.executeCommand('auraR.diagnostics');
let shotN = 0;

async function shot() {
  const dir = process.env.AURA_IT_SHOTS;
  if (!dir) return;
  shotN++;
  await sleep(2500);
  fs.writeFileSync(path.join(dir, `shot-${shotN}.want`), '');
  for (let i = 0; i < 60 && !fs.existsSync(path.join(dir, `shot-${shotN}.done`)); i++) await sleep(500);
}

async function showWalkthrough() {
  await vscode.commands.executeCommand('auraR.openWalkthrough');
  await sleep(1000);
}

/** Runs a command that shows a quick pick, then accepts the first item or closes the pick. */
async function withPick(command, accept, arg) {
  const p = vscode.commands.executeCommand(command, arg);
  await sleep(1500);
  await vscode.commands.executeCommand(accept ? 'workbench.action.acceptSelectedQuickOpenItem' : 'workbench.action.closeQuickOpen');
  return (await p) ?? null;
}

async function run() {
  const out = { mode: process.env.AURA_IT_INSTALL_VSIX ? 'installed into the running window' : 'loaded at startup', steps: [] };
  const log = (name, value) => out.steps.push({ name, value });
  try {
    if (process.env.AURA_IT_INSTALL_VSIX && process.env.AURA_IT_INSTALL_CLI === '1') {
      const cli = path.join(path.dirname(process.execPath), 'bin', 'code.cmd');
      const args = ['--install-extension', process.env.AURA_IT_INSTALL_VSIX, `--user-data-dir=${process.env.AURA_IT_USER_DATA}`, `--extensions-dir=${process.env.AURA_IT_EXT_DIR}`];
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      log('cli install', cp.spawnSync(`"${cli}"`, args, { env, shell: true, encoding: 'utf8', windowsHide: true }).stdout.trim());
      for (let i = 0; i < 240 && !vscode.extensions.getExtension(EXT)?.isActive; i++) await sleep(250);
    } else if (process.env.AURA_IT_INSTALL_VSIX) {
      await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(process.env.AURA_IT_INSTALL_VSIX));
      for (let i = 0; i < 120 && !vscode.extensions.getExtension(EXT)?.isActive; i++) await sleep(250);
    } else {
      await vscode.extensions.getExtension(EXT).activate();
    }
    log('active', !!vscode.extensions.getExtension(EXT)?.isActive);
    log('version', vscode.extensions.getExtension(EXT)?.packageJSON.version);
    await sleep(3000);
    log('fresh: diagnostics', await diag());
    await showWalkthrough();
    await shot(); // 1

    log('cancelled pick returned', await withPick('auraR.pickCourse', false));
    await showWalkthrough();
    await shot(); // 2

    log('pick returned', await withPick('auraR.pickCourse', true));
    log('after pick: done keys', (await diag()).walkthroughDone);
    await showWalkthrough();
    await shot(); // 3
    if (process.env.AURA_IT_QUICK === '1') return;

    const before = await vscode.commands.executeCommand('auraR.checkSetup', { course: 'mc427', silent: true });
    log('check without the R extension: failing', before.failing);
    await showWalkthrough();
    await shot(); // 4

    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(process.env.AURA_IT_VSCODE_R_VSIX));
    for (let i = 0; i < 40 && !vscode.extensions.getExtension('REditorSupport.r'); i++) await sleep(250);
    const after = await vscode.commands.executeCommand('auraR.checkSetup', { course: 'mc427', silent: true });
    log('check with the R extension: failing', after.failing);
    await showWalkthrough();
    await shot(); // 5

    await withPick('auraR.getHelp', false);
    log('after help: done keys', (await diag()).walkthroughDone);
    await showWalkthrough();
    await shot(); // 6
  } catch (e) {
    out.error = String((e && e.stack) || e);
  } finally {
    fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
  }
}

module.exports = { run };
