// Integration run inside a real VS Code (scripts/integration.mjs launches it with a fresh profile).
// Drives the extension only through the command API, never by keystrokes or clicks, and writes
// what it saw to the file named by AURA_IT_OUT. Covers: walkthrough ticks only on success (a
// cancelled course pick leaves no tick), Install what is missing asking VS Code to add the R
// extension, and the report never printing SETUP OK while a required line is not OK.
// With AURA_IT_SHOTS set, scripts/verify/capture-window.ps1 saves screenshots of this window.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const diag = () => vscode.commands.executeCommand('auraR.diagnostics');
let shotN = 0;

/** Asks the capture script for a screenshot of this window and waits for it. */
async function shot() {
  const dir = process.env.AURA_IT_SHOTS;
  if (!dir) return;
  shotN++;
  await sleep(2500);
  fs.writeFileSync(path.join(dir, `shot-${shotN}.want`), '');
  for (let i = 0; i < 60 && !fs.existsSync(path.join(dir, `shot-${shotN}.done`)); i++) await sleep(500);
}

async function openWalkthrough() {
  await vscode.commands.executeCommand('auraR.openWalkthrough');
}

async function run() {
  const out = { steps: [] };
  const log = (name, value) => out.steps.push({ name, value });
  try {
    await vscode.extensions.getExtension('aura-lab-siue.r-companion').activate();
    log('fresh: walkthrough done keys', (await diag()).walkthroughDone);

    // A cancelled pick must not tick "Pick your course"
    const cancelled = vscode.commands.executeCommand('auraR.pickCourse');
    await sleep(1500);
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    log('cancelled pick returned', (await cancelled) ?? null);
    log('after cancel: walkthrough done keys', (await diag()).walkthroughDone);
    await openWalkthrough();
    await shot(); // 1: no tick on Pick your course

    // Choosing the first item (MC 427) ticks it; the toast should read whole
    const picked = vscode.commands.executeCommand('auraR.pickCourse');
    await sleep(1500);
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    log('pick returned', (await picked) ?? null);
    log('after pick: walkthrough done keys', (await diag()).walkthroughDone);
    await shot(); // 2: tick on Pick your course, and the course-set toast

    // The check, with no R extension in this profile
    const before = await vscode.commands.executeCommand('auraR.checkSetup', { course: 'mc427', silent: true });
    log('before install: failing', before.failing);
    log('before install: report last two lines', before.text.split('\n').slice(-2));
    log('before install: walkthrough done keys', (await diag()).walkthroughDone);

    // Install what is missing asks VS Code to add the R extension. VS Code then asks the student
    // "Do you trust the publisher REditorSupport?"; a test cannot answer that dialog, so this
    // install is expected to stop there, and the result must say the extension is still missing.
    const inst = await vscode.commands.executeCommand('auraR.installMissing', { course: 'mc427', silent: true });
    log('install attempted', inst.attempted);
    log('install verified', inst.verified);
    log('install stillFailing', inst.stillFailing);
    log('after first install: report last two lines', inst.after.text.split('\n').slice(-2));

    // Stand-in for the student's "Trust Publisher & Install" click: install the same extension from
    // its Open VSX .vsix (AURA_IT_VSCODE_R_VSIX), which a test may do without that dialog. The
    // extension itself never skips the question. Then the same check the student runs next.
    await vscode.commands.executeCommand(
      'workbench.extensions.installExtension',
      vscode.Uri.file(process.env.AURA_IT_VSCODE_R_VSIX),
    );
    for (let i = 0; i < 40 && !vscode.extensions.getExtension('REditorSupport.r'); i++) await sleep(250);
    log('REditorSupport.r visible to extensions without a reload', !!vscode.extensions.getExtension('REditorSupport.r'));
    const after = await vscode.commands.executeCommand('auraR.checkSetup', { course: 'mc427', silent: true });
    log('after trust: failing', after.failing);
    log('after trust: report last two lines', after.text.split('\n').slice(-2));
    log('after trust: walkthrough done keys', (await diag()).walkthroughDone);

    // Where to get help: ticks once the list is shown
    const help = vscode.commands.executeCommand('auraR.getHelp');
    await sleep(1500);
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    await help;
    log('after help: walkthrough done keys', (await diag()).walkthroughDone);
    await openWalkthrough();
    await shot(); // 3: all four steps ticked
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
