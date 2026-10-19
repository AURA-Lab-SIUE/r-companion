// Launches the installed VS Code with a fresh profile and runs test-integration/suite.js in it.
// Usage: AURA_IT_VSCODE_R_VSIX=<REditorSupport.r .vsix> node scripts/integration.mjs <Code.exe> <scratch folder>
// Needs network (R packages from CRAN). The .vsix comes from open-vsx.org/extension/REditorSupport/r.
// AURA_IT_SUITE picks another suite (test-integration/walkthrough.js); AURA_IT_SEED=mc427 puts
// mc427-setup-check.R in the workspace; with AURA_IT_INSTALL_VSIX the window starts on an empty
// stub extension and the suite installs the .vsix into it, as a student installs from the Marketplace.
// AURA_IT_CDP_PORT opens the window's DevTools port so a suite can drive a webview (r2card.js);
// AURA_IT_SHOT_COUNT raises how many screenshots the capture script answers (default 10).
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
if (process.env.AURA_IT_SEED === 'mc427') {
  fs.writeFileSync(path.join(dirs.workspace, 'mc427-setup-check.R'), '# MC 427 setup check (test seed)\n');
}
const suite = path.resolve(repo, process.env.AURA_IT_SUITE || path.join('test-integration', 'suite.js'));
const devPath = process.env.AURA_IT_INSTALL_VSIX
  ? path.join(repo, 'test-integration', 'host-stub')
  : process.env.AURA_IT_EXT_PATH || repo;
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
      // AURA_IT_STARTUP_EDITOR=none matches the video capture profile, where nothing opens the
      // Welcome page at startup, so VS Code builds its walkthrough list only when one is opened
      ...(process.env.AURA_IT_STARTUP_EDITOR ? { 'workbench.startupEditor': process.env.AURA_IT_STARTUP_EDITOR } : {}),
    },
    null,
    2,
  ),
);
// AURA_IT_PREINSTALL_VSIX: install an extension (the R extension's Open VSX .vsix) into the scratch
// profile before launch, so it is there at startup the way a student has it (runit.js)
if (process.env.AURA_IT_PREINSTALL_VSIX) {
  const cli = process.platform === 'win32' ? path.join(path.dirname(code), 'bin', 'code.cmd') : path.join(path.dirname(code), 'bin', 'code');
  // shell: true runs a .cmd on Windows, so every path is quoted (the install folder has spaces)
  const q = (s) => (process.platform === 'win32' ? `"${s}"` : s);
  const pre = spawnSync(q(cli), [q(`--extensions-dir=${dirs.extensions}`), '--install-extension', q(process.env.AURA_IT_PREINSTALL_VSIX)], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  console.log(`Pre-install exited with ${pre.status}`);
}
// Screenshots of the test window only (Windows): the suite asks, capture-window.ps1 answers
const shots = path.join(scratch, 'shots');
fs.mkdirSync(shots, { recursive: true });
let capture;
if (process.platform === 'win32') {
  capture = spawn(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repo, 'scripts', 'capture-window.ps1'), '-Dir', shots, '-Count', process.env.AURA_IT_SHOT_COUNT || '10'],
    { stdio: 'ignore', windowsHide: true },
  );
}

const env = { ...process.env, AURA_IT_OUT: result, AURA_IT_SHOTS: capture ? shots : '', AURA_IT_USER_DATA: dirs['user-data'], AURA_IT_EXT_DIR: dirs.extensions };
delete env.ELECTRON_RUN_AS_NODE;
const r = spawnSync(
  code,
  [
    dirs.workspace,
    `--user-data-dir=${dirs['user-data']}`,
    `--extensions-dir=${dirs.extensions}`,
    // AURA_IT_EXT_PATH: the unpacked extension/ folder of a built .vsix, to test what ships
    `--extensionDevelopmentPath=${devPath}`,
    `--extensionTestsPath=${suite}`,
    '--disable-workspace-trust',
    '--skip-release-notes',
    '--new-window',
    ...(process.env.AURA_IT_CDP_PORT ? [`--remote-debugging-port=${process.env.AURA_IT_CDP_PORT}`] : []),
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
