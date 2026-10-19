// Launches the installed VS Code with a fresh profile and runs test-integration/suite.js in it.
// Usage: AURA_IT_VSCODE_R_VSIX=<REditorSupport.r .vsix> node scripts/integration.mjs <Code.exe> <scratch folder>
// Needs network (R packages from CRAN). The .vsix comes from open-vsx.org/extension/REditorSupport/r.
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const [code, scratch] = process.argv.slice(2);
if (!code || !scratch) {
  console.error('Usage: node scripts/integration.mjs <Code.exe> <scratch folder>');
  process.exit(2);
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = Object.fromEntries(['user-data', 'extensions', 'workspace'].map((d) => [d, path.join(scratch, d)]));
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
const result = path.join(scratch, 'result.json');
fs.rmSync(result, { force: true });
// The zoom and font sizes of the leith-hp recording profile (run2, 2026-10-19)
fs.mkdirSync(path.join(dirs['user-data'], 'User'), { recursive: true });
fs.writeFileSync(
  path.join(dirs['user-data'], 'User', 'settings.json'),
  JSON.stringify(
    {
      'window.zoomLevel': 0.5,
      'editor.fontSize': 18,
      'terminal.integrated.fontSize': 17,
      // Keeps VS Code's own sign-in welcome from covering the screenshots
      'workbench.welcomePage.experimentalOnboarding': false,
      'chat.disableAIFeatures': true,
    },
    null,
    2,
  ),
);
// Screenshots of the test window only (Windows): the suite asks, capture-window.ps1 answers
const shots = path.join(scratch, 'shots');
fs.mkdirSync(shots, { recursive: true });
let capture;
if (process.platform === 'win32') {
  capture = spawn(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repo, 'scripts', 'capture-window.ps1'), '-Dir', shots],
    { stdio: 'ignore', windowsHide: true },
  );
}

const env = { ...process.env, AURA_IT_OUT: result, AURA_IT_SHOTS: capture ? shots : '' };
delete env.ELECTRON_RUN_AS_NODE;
const r = spawnSync(
  code,
  [
    dirs.workspace,
    `--user-data-dir=${dirs['user-data']}`,
    `--extensions-dir=${dirs.extensions}`,
    `--extensionDevelopmentPath=${repo}`,
    `--extensionTestsPath=${path.join(repo, 'test-integration', 'suite.js')}`,
    '--disable-workspace-trust',
    '--skip-release-notes',
    '--new-window',
  ],
  { env, stdio: 'inherit', timeout: 15 * 60 * 1000 },
);
console.log(`VS Code exited with ${r.status}`);
capture?.kill();
// vscode-R's language server (R.exe from this scratch profile) outlived VS Code on Windows
// (2026-10-19): stop only processes whose command line names this scratch folder
if (process.platform === 'win32') {
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.resolve(scratch)}*' -and $_.ProcessId -ne $PID } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`;
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore', windowsHide: true });
}
if (!fs.existsSync(result)) {
  console.error('No result file: the suite did not run.');
  process.exit(1);
}
console.log(fs.readFileSync(result, 'utf8'));
