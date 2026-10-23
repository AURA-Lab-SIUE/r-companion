// The Quarto extension row (0.5.4, #rgui item 8), run inside a real VS Code by scripts/integration.mjs
// with AURA_IT_SUITE=test-integration/quartorow.js. Run it twice as a toggle:
//   AURA_IT_PREINSTALL_VSIX = vscode-R only,                AURA_IT_EXPECT_QUARTO=0: MISSING, Show button
//   AURA_IT_PREINSTALL_VSIX = vscode-R;quarto.quarto,       AURA_IT_EXPECT_QUARTO=1: OK
// MC 427 never shows the row. The Show button's command opens the Extensions view on @id:quarto.quarto.
const vscode = require('vscode');
const fs = require('fs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const out = { steps: [], checks: [] };
  const log = (name, value) => { out.steps.push({ name, value }); fs.writeFileSync(process.env.AURA_IT_OUT + '.partial', JSON.stringify(out, null, 2)); };
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, ...(ok ? {} : { detail }) });
  try {
    const expectOn = process.env.AURA_IT_EXPECT_QUARTO === '1';
    await vscode.extensions.getExtension('aura-lab-siue.r-companion').activate();
    log('quarto.quarto', vscode.extensions.getExtension('quarto.quarto') ? vscode.extensions.getExtension('quarto.quarto').packageJSON.version : 'not installed');
    const row = (r) => r.items.find((i) => i.name === 'Quarto extension for VS Code');
    for (const course of ['mc451', 'mc501']) {
      const r = await vscode.commands.executeCommand('auraR.checkSetup', { course, silent: true });
      const it = row(r);
      log(`${course} row`, it);
      check(`${course}: ${expectOn ? 'OK' : 'MISSING with a Show button'}`, it && (expectOn ? it.status === 'ok' : it.status === 'missing' && it.showExtension === 'quarto.quarto'), it);
      check(`${course}: ${expectOn ? 'not in' : 'in'} the items to fix`, expectOn ? !r.failing.includes(it.name) : r.failing.includes(it.name), r.failing);
    }
    const r427 = await vscode.commands.executeCommand('auraR.checkSetup', { course: 'mc427', silent: true });
    check('mc427: no Quarto extension row', !row(r427));
    if (!expectOn) {
      // The button's own command, then the Extensions view's search box holds the id
      await vscode.commands.executeCommand('workbench.extensions.search', '@id:quarto.quarto');
      await sleep(2000);
      log('extensions view opened', true);
    }
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  out.passed = out.checks.filter((c) => c.ok).length;
  out.total = out.checks.length;
  fs.writeFileSync(process.env.AURA_IT_OUT, JSON.stringify(out, null, 2));
}

module.exports = { run };
