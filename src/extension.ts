// AURA Lab R Companion: R1 Setup through R4 Tests (0.4.0).
//
// R1 commands: Check my setup, Install what is missing, Pick my course, Open my course workspace,
// Where to get help, Explain an R error, Run the course setup check script, Open an R terminal,
// Check for updates, and the Get Started walkthrough. R2 to R4: Write R code (menus.ts), the
// reliability grid, the data viewer and coding sheet (dataViewer.ts), Check my test choice, and
// three read-only Copilot tools (copilotTools.ts).
// Network: only the CRAN and GitHub downloads a student starts, and the optional GitHub release
// check for .vsix installs. No telemetry.

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CourseId, CourseProfile, PROFILES, COURSE_IDS, courseSetMessage, isCourseId, packageNames, PackageSpec } from './profiles';
import { discoverR, systemEnv, RCandidate } from './rDiscovery';
import {
  buildChecklist,
  CheckItem,
  extensionPlan,
  installPlan,
  isFailing,
  parseProbeOutput,
  ProbeResult,
  renderText,
  STATUS_WORD,
} from './checklist';
import { explain, Explanation } from './errors';
import { pickAdapter, TerminalAdapter, inPositron } from './adapters';
import { checkForUpdate, installSource } from './update';
import { installScript } from './installScript';
import { mergeRecommendations } from './courseFiles';
import { TrustGate } from './trustGate';
import { registerMenus } from './menus';
import { openDataViewer, ViewerDeps } from './dataViewer';
import { registerCopilotTools, CopilotToolsSetting } from './copilotTools';
import { checkTestChoice, fittingTests, ComparisonKind, OutcomeKind, TestId, TEST_LABEL, OUTCOME_LABEL, COMPARISON_LABEL } from './testChoice';

const EXT_ID = 'aura-lab-siue.r-companion';
const WALKTHROUGH = `${EXT_ID}#getStarted`;

let output: vscode.OutputChannel;
let terminalAdapter: TerminalAdapter;
let ctx: vscode.ExtensionContext;
let trustGate: TrustGate;

// Walkthrough steps complete on these context keys (package.json completionEvents), set only once
// the step's action has succeeded, never when its button is selected
export const DONE = {
  course: 'auraR.done.course',
  setup: 'auraR.done.setupOk',
  workspace: 'auraR.done.workspace',
  help: 'auraR.done.help',
} as const;
type DoneKey = (typeof DONE)[keyof typeof DONE];
// The step each key completes, as package.json names it
const DONE_STEP: Record<DoneKey, string> = {
  [DONE.course]: 'pickCourse',
  [DONE.setup]: 'checkSetup',
  [DONE.workspace]: 'openWorkspace',
  [DONE.help]: 'getHelp',
};
const doneKeys = new Set<string>();

// The context key alone is not enough: VS Code records a key that is already true when it registers
// the walkthrough as seen, with no tick, and ignores it from then on. It registers late whenever
// nothing opens the Welcome page at startup, so a key set before that never ticks its step
// (toggled 2026-10-19 with workbench.startupEditor). welcome.markStepComplete records the tick
// itself, before or after the walkthrough registers; it reports an error in the "before" case
// after recording it, so the error is ignored.
function markDone(key: DoneKey) {
  doneKeys.add(key);
  void vscode.commands.executeCommand('setContext', key, true);
  void Promise.resolve(vscode.commands.executeCommand('welcome.markStepComplete', `${WALKTHROUGH}#${DONE_STEP[key]}`)).catch(() => undefined);
}

export interface CheckResult {
  course: CourseId;
  r?: RCandidate;
  probe?: ProbeResult;
  items: CheckItem[];
  text: string;
  failing: string[];
}

export interface InstallResult {
  attempted: string[];
  verified: string[];
  stillFailing: string[];
  explanations: string[];
  before: CheckResult;
  after: CheckResult;
}

interface SilentOpts {
  silent?: boolean;
  course?: CourseId;
  includeRecommended?: boolean;
  packages?: string[];
}

export function activate(context: vscode.ExtensionContext) {
  ctx = context;
  output = vscode.window.createOutputChannel('AURA Lab R Companion');
  terminalAdapter = new TerminalAdapter(() => findR()[0]?.rterm, context.globalStorageUri.fsPath);
  context.subscriptions.push(output, { dispose: () => terminalAdapter.dispose() });
  trustGate = new TrustGate({
    isTrusted: () => vscode.workspace.isTrusted,
    askModal: (message, detail, button) => vscode.window.showWarningMessage(message, { modal: true, detail }, button),
    openTrustPage: () => vscode.commands.executeCommand('workbench.trust.manage'),
    now: () => Date.now(),
  });
  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => void trustGate.granted()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('auraR.course') && currentCourse()) markDone(DONE.course);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (vscode.workspace.workspaceFolders?.length) markDone(DONE.workspace);
    }),
  );

  const reg = (id: string, fn: (...args: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg('auraR.checkSetup', (opts?: SilentOpts) => checkSetupCommand(opts));
  reg('auraR.installMissing', (opts?: SilentOpts) => installMissingCommand(opts));
  reg('auraR.pickCourse', () => pickCourse(true));
  reg('auraR.openCourseWorkspace', () => openCourseWorkspace());
  reg('auraR.getHelp', () => getHelp());
  reg('auraR.explainError', (text?: string) => explainErrorCommand(text));
  reg('auraR.runCourseSetupCheck', () => runCourseSetupCheck());
  reg('auraR.openRTerminal', () => openRTerminal());
  reg('auraR.checkForUpdates', () => checkForUpdatesCommand(false));
  reg('auraR.openWalkthrough', () => openWalkthrough());
  reg('auraR.addCourseFiles', (opts?: SilentOpts) => addCourseFiles(opts));
  const viewerDeps: ViewerDeps = {
    rscript: () => findR()[0]?.rscript,
    bridgeScript: resourcePath('bridge.R'),
    mediaRoot: path.join(context.extensionPath, 'media', 'grid'),
    output,
  };
  reg('auraR.openDataViewer', () => openDataViewer(context, viewerDeps));
  // For tests and support: which run adapter and install source this copy sees
  reg('auraR.diagnostics', () => ({
    adapter: pickAdapter(setting('runWith', 'auto'), terminalAdapter).id,
    installSource: installSource(context),
    r: findR(),
    course: currentCourse(),
    walkthroughDone: [...doneKeys],
    waitingForTrust: trustGate.waiting,
  }));
  // R2/R3/R4 code-generation menus and the reliability grid (workstream E)
  registerMenus(context, {
    output,
    currentCourse,
    pickCourse,
    runRscript: (rscript, args, timeoutMs) => runRscript(rscript, args, { timeoutMs }),
    rscriptPath: () => findR()[0]?.rscript,
    runInSession: (code) => pickAdapter(setting('runWith', 'auto'), terminalAdapter).runCode(code),
    requireTrust,
    resourcePath,
    storageDir: context.globalStorageUri.fsPath,
    plainCalls: () => setting<boolean>('plainCalls', true),
    apaCheck: () => setting<boolean>('apaCheck', true),
    mc427TestMenu: () => (setting<string>('mc427TestMenu', 'cross-check') === 'writer' ? 'writer' : 'cross-check'),
  });
  reg('auraR.checkTestChoice', (input?: TestChoiceInput) => checkTestChoiceCommand(input));
  // R4 Copilot tools: read-only, on for MC 451 and MC 501, off for MC 427 by default (U3)
  registerCopilotTools(context, {
    setting: () => setting<CopilotToolsSetting>('copilotTools', 'auto'),
    currentCourse,
    checkSetup: async (course) => {
      const r = await runCheck(course);
      return {
        course,
        ok: r.failing.length === 0,
        lines: r.items.map((i) => `[${STATUS_WORD[i.status]}] ${i.name}: ${i.detail}`),
      };
    },
  });

  // A course found in the folder or remembered is not a pick: "Pick your course" ticks only when the
  // student picks one, even the one already found. A folder already open does count as opened.
  if (vscode.workspace.workspaceFolders?.length) markDone(DONE.workspace);

  // First run: open the Get Started walkthrough once
  if (!context.globalState.get<boolean>('auraR.walkthroughShown')) {
    void context.globalState.update('auraR.walkthroughShown', true);
    void openWalkthrough();
  }
  // Update check for .vsix installs only, at most once a day, and only when a release URL is set
  void checkForUpdatesCommand(true);
}

export function deactivate() {}

// ---------- settings and course ----------

function setting<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('auraR').get<T>(key, fallback);
}

function currentCourse(): CourseId | undefined {
  const fromSetting = setting<string>('course', '');
  if (isCourseId(fromSetting)) return fromSetting;
  const remembered = ctx.workspaceState.get<string>('auraR.course') ?? ctx.globalState.get<string>('auraR.course');
  if (isCourseId(remembered)) return remembered;
  if (workspaceHas('mc427-setup-check.R')) return 'mc427';
  return undefined;
}

async function rememberCourse(id: CourseId) {
  await ctx.workspaceState.update('auraR.course', id);
  await ctx.globalState.update('auraR.course', id);
}

async function pickCourse(alwaysAsk: boolean): Promise<CourseId | undefined> {
  const now = currentCourse();
  if (now && !alwaysAsk) return now;
  const pick = await vscode.window.showQuickPick(
    COURSE_IDS.map((id) => ({
      label: PROFILES[id].label,
      description: id === now ? 'current' : undefined,
      id,
    })),
    { title: 'Which course are you in?', placeHolder: 'Pick your course so the extension checks the right packages' },
  );
  if (!pick) return undefined;
  await rememberCourse(pick.id);
  markDone(DONE.course);
  vscode.window.showInformationMessage(courseSetMessage(PROFILES[pick.id]));
  return pick.id;
}

function workspaceHas(file: string): boolean {
  return (vscode.workspace.workspaceFolders ?? []).some((f) => fs.existsSync(path.join(f.uri.fsPath, file)));
}

// ---------- finding and running R ----------

/** A setting value, ignoring the workspace's own value while the folder is untrusted. */
function trustedSetting(conf: vscode.WorkspaceConfiguration, key: string): string {
  if (vscode.workspace.isTrusted) return conf.get<string>(key, '');
  return conf.inspect<string>(key)?.globalValue ?? '';
}

/**
 * Restricted Mode: running R inside an untrusted folder would run that folder's .Rprofile, so
 * anything that starts R there asks for trust first, in one modal, and then resumes by itself
 * (TrustGate). The checks run from a neutral folder instead.
 */
function requireTrust(what: string, rerun: () => unknown): Promise<boolean> {
  return trustGate.require(what, rerun);
}

function findR(): RCandidate[] {
  const osKey = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const rconf = vscode.workspace.getConfiguration('r');
  return discoverR(
    {
      auraRPath: setting<string>('rPath', ''),
      rpath: trustedSetting(rconf, `rpath.${osKey}`),
      rterm: trustedSetting(rconf, `rterm.${osKey}`),
    },
    systemEnv(),
  );
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runRscript(
  rscript: string,
  args: string[],
  opts: { onData?: (s: string) => void; token?: vscode.CancellationToken; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(rscript, ['--no-save', '--no-restore', ...args], {
      windowsHide: true,
      // In an untrusted folder, never start R where it would read that folder's .Rprofile
      cwd: vscode.workspace.isTrusted ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath : os.tmpdir(),
      env: { ...process.env, R_CLI_NUM_COLORS: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
      opts.onData?.(d);
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
      opts.onData?.(d);
    });
    const timer = opts.timeoutMs ? setTimeout(() => child.kill(), opts.timeoutMs) : undefined;
    opts.token?.onCancellationRequested(() => child.kill());
    child.on('error', reject);
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function resourcePath(name: string): string {
  return path.join(ctx.extensionPath, 'resources', name);
}

// ---------- Check my setup ----------

async function runCheck(course: CourseId, progress?: vscode.Progress<{ message?: string }>): Promise<CheckResult> {
  const profile = PROFILES[course];
  const candidates = findR();
  const r = candidates[0];
  if (!r) {
    const items: CheckItem[] = [
      {
        name: 'R',
        group: 'R',
        status: 'missing',
        detail:
          'R was not found on this computer. Install it from cloud.r-project.org with the default options, then quit VS Code completely and open it again.',
      },
    ];
    const text = `AURA Lab R Companion: setup check for ${profile.label}\n\n  [MISSING] R: ${items[0].detail}\n\nRESULT: 1 item(s) to fix: R.`;
    return { course, items, text, failing: ['R'] };
  }
  progress?.report({ message: 'Asking R which packages are installed (this can take 20 seconds)' });
  const res = await runRscript(r.rscript, [resourcePath('probe.R'), packageNames(profile).join(','), profile.runV2vSetup ? '1' : '0'], {
    timeoutMs: 180000,
  });
  let probe: ProbeResult;
  try {
    probe = parseProbeOutput(res.stdout);
  } catch (e) {
    output.appendLine(res.stdout);
    output.appendLine(res.stderr);
    throw new Error(`R was found at ${r.rscript} but the check could not read its answer. The output panel has R's own message.`);
  }
  const items = buildChecklist(profile, probe, {
    rscript: r.rscript,
    rSource: r.source,
    vscodeRInstalled: vscode.extensions.getExtension('REditorSupport.r') !== undefined,
    inPositron: inPositron(),
    setupScriptInWorkspace: profile.setupScript ? workspaceHas(profile.setupScript) : undefined,
  });
  const text = renderText(profile, probe, items, new Date());
  return { course, r, probe, items, text, failing: items.filter(isFailing).map((i) => i.name) };
}

async function checkSetupCommand(opts?: SilentOpts): Promise<CheckResult | undefined> {
  const course = opts?.course ?? (await pickCourse(false));
  if (!course) return undefined;
  let result: CheckResult;
  try {
    result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'AURA: Checking your setup' },
      (progress) => runCheck(course, progress),
    );
  } catch (e: any) {
    output.appendLine(`Setup check failed: ${e?.message ?? e}`);
    if (!opts?.silent) {
      vscode.window.showErrorMessage(`${e?.message ?? e}`, 'Show output').then((b) => b && output.show());
    }
    throw e;
  }
  output.appendLine(result.text);
  output.appendLine('');
  if (result.failing.length === 0) markDone(DONE.setup);
  if (!opts?.silent) void showChecklist(result);
  return result;
}

type ActionItem = vscode.QuickPickItem & { action?: () => Thenable<unknown> | void };

const ICON: Record<string, string> = {
  ok: '$(pass)',
  missing: '$(error)',
  outdated: '$(arrow-circle-up)',
  broken: '$(error)',
  warn: '$(warning)',
  info: '$(info)',
};

async function showChecklist(result: CheckResult): Promise<void> {
  const profile = PROFILES[result.course];
  const plan = installPlan(result.items, false);
  const exts = result.items.filter((i) => i.installableExtension && isFailing(i)).map((i) => i.name);
  const recommended = installPlan(result.items, true).filter((p) => !plan.some((q) => q.name === p.name));
  const picks: ActionItem[] = [];
  picks.push({ label: 'What to do', kind: vscode.QuickPickItemKind.Separator });
  if (plan.length + exts.length > 0) {
    const names = [...plan.map((p) => p.name), ...exts];
    picks.push({
      label: `$(cloud-download) Install what is missing (${names.length})`,
      detail: names.join(', '),
      action: () => installMissingCommand({ course: result.course }),
    });
  }
  if (recommended.length > 0) {
    picks.push({
      label: `$(cloud-download) Install the recommended packages too (${recommended.length})`,
      detail: recommended.map((p) => p.name).join(', '),
      action: () => installMissingCommand({ course: result.course, includeRecommended: true }),
    });
  }
  if (profile.setupScript && workspaceHas(profile.setupScript)) {
    picks.push({
      label: `$(play) Run ${profile.setupScript} in an R terminal`,
      detail: 'The course check that prints SETUP OK, for your screenshot',
      action: () => runCourseSetupCheck(),
    });
  }
  picks.push({ label: '$(copy) Copy this report', detail: 'Paste it when you ask for help', action: () => copyReport(result) });
  picks.push({ label: '$(output) Show the full report', action: () => output.show() });
  let group = '';
  for (const it of result.items) {
    if (it.group !== group) {
      group = it.group;
      picks.push({ label: group, kind: vscode.QuickPickItemKind.Separator });
    }
    picks.push({
      label: `${ICON[it.status]} ${it.name}`,
      description: STATUS_WORD[it.status],
      detail: it.detail,
    });
  }
  const lines = profile.resultLines;
  const title =
    result.failing.length === 0
      ? lines?.ok ?? `${profile.label}: everything is installed`
      : `${profile.label}: ${result.failing.length} item(s) to fix`;
  const choice = await vscode.window.showQuickPick(picks, {
    title,
    placeHolder: 'Choose an action, or press Esc to close. The report is also in the Output panel.',
    matchOnDetail: true,
  });
  await choice?.action?.();
}

async function copyReport(result: CheckResult) {
  await vscode.env.clipboard.writeText(result.text);
  vscode.window.showInformationMessage('Setup report copied. Paste it into your message.');
}

// ---------- Install what is missing ----------

async function installMissingCommand(opts?: SilentOpts): Promise<InstallResult | undefined> {
  const course = opts?.course ?? (await pickCourse(false));
  if (!course) return undefined;
  const before = await checkSetupCommand({ course, silent: true });
  if (!before) return undefined;
  if (!before.r) {
    if (!opts?.silent) void showChecklist(before);
    return undefined;
  }
  let plan = installPlan(before.items, !!opts?.includeRecommended);
  if (opts?.packages) plan = plan.filter((p) => opts.packages!.includes(p.name));
  const exts = opts?.packages ? [] : extensionPlan(before.items);
  if (plan.length === 0 && exts.length === 0) {
    if (!opts?.silent) vscode.window.showInformationMessage('Nothing to install: everything this course needs is already there.');
    return { attempted: [], verified: [], stillFailing: before.failing, explanations: [], before, after: before };
  }
  for (const id of exts) await installExtension(id);
  if (plan.length === 0) return finishInstall(course, [], { code: 0, stdout: '', stderr: '' }, before, exts, opts);

  // Windows will not replace a package an open R session has loaded (install-v2v "file is in use")
  const rTerminals = vscode.window.terminals.filter((t) => /(^|\s)R(\s|$)|R Interactive|R \(AURA\)/.test(t.name));
  if (rTerminals.length > 0 && !opts?.silent) {
    const b = await vscode.window.showWarningMessage(
      'An R terminal is open. On Windows, R cannot replace a package that session has loaded. Close it before installing?',
      'Close R terminals and install',
      'Install anyway',
    );
    if (!b) return undefined;
    if (b.startsWith('Close')) rTerminals.forEach((t) => t.dispose());
  }

  const mirror = setting<string>('cranMirror', 'https://cloud.r-project.org');
  fs.mkdirSync(ctx.globalStorageUri.fsPath, { recursive: true });
  const scriptPath = path.join(ctx.globalStorageUri.fsPath, 'install-missing.R');
  fs.writeFileSync(scriptPath, installScript(plan, mirror));
  output.show(true);
  output.appendLine(`Installing ${plan.map((p) => p.name).join(', ')} with R at ${before.r.rscript}`);
  output.appendLine(`Script: ${scriptPath}`);

  const res = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `AURA: Installing ${plan.length} package(s). This can take several minutes.`,
      cancellable: true,
    },
    (progress, token) =>
      runRscript(before.r!.rscript, [scriptPath], {
        token,
        onData: (s) => {
          output.append(s);
          const last = s.trim().split(/\r?\n/).pop();
          if (last) progress.report({ message: last.slice(0, 80) });
        },
      }),
  );
  output.appendLine(`R finished (exit code ${res.code}). Checking the library now; the exit code alone proves nothing.`);
  return finishInstall(course, plan, res, before, exts, opts);
}

/** Installs a VS Code extension and waits until VS Code reports it, so the re-check can see it. */
async function installExtension(id: string): Promise<void> {
  output.appendLine(`Installing the VS Code extension ${id}`);
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `AURA: Installing the VS Code extension ${id}` },
      async () => {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', id);
        for (let i = 0; i < 40 && !vscode.extensions.getExtension(id); i++) {
          await new Promise((r) => setTimeout(r, 250));
        }
      },
    );
  } catch (e: any) {
    output.appendLine(`Could not install ${id}: ${e?.message ?? e}`);
  }
}

async function finishInstall(
  course: CourseId,
  plan: PackageSpec[],
  res: RunResult,
  before: CheckResult,
  exts: string[],
  opts?: SilentOpts,
): Promise<InstallResult | undefined> {
  const explanations = explain(res.stdout + '\n' + res.stderr, course);
  const after = await checkSetupCommand({ course, silent: true });
  if (!after) return undefined;
  const extNames = before.items.filter((i) => i.installableExtension && exts.includes(i.installableExtension)).map((i) => i.name);
  const attempted = [...plan.map((p) => p.name), ...extNames];
  const failingAfter = new Set(after.items.filter(isFailing).map((i) => i.name));
  const missingAfter = new Set(after.items.filter((i) => i.installable && i.status !== 'ok').map((i) => i.name));
  const verified = attempted.filter((n) => !failingAfter.has(n) && !missingAfter.has(n));
  const stillFailing = attempted.filter((n) => !verified.includes(n));
  output.appendLine(`Verified from the library: ${verified.join(', ') || 'none'}`);
  if (stillFailing.length) output.appendLine(`Still not installed: ${stillFailing.join(', ')}`);
  for (const e of explanations) output.appendLine(`Possible cause: ${e.entry.title}. ${e.entry.fix.join(' ')}`);

  if (!opts?.silent) {
    const pkgs = verified.filter((n) => !extNames.includes(n));
    const extsOk = verified.filter((n) => extNames.includes(n));
    if (stillFailing.length === 0) {
      const parts = [
        pkgs.length ? `Installed and confirmed from your R library: ${pkgs.join(', ')}.` : '',
        extsOk.length ? `Added the ${extsOk.join(', ')}.` : '',
      ];
      vscode.window.showInformationMessage(parts.filter(Boolean).join(' '));
      void showChecklist(after);
    } else if (stillFailing.every((n) => extNames.includes(n))) {
      // VS Code asks the student to trust the extension's publisher; Cancel there lands here
      void vscode.window
        .showWarningMessage(
          `The ${stillFailing.join(', ')} is not installed yet. Select Install again, then Trust Publisher & Install.`,
          'Install again',
        )
        .then((b) => b && installMissingCommand({ course }));
    } else {
      void showExplanations(explanations, `Still not installed: ${stillFailing.join(', ')}`);
    }
  }
  return { attempted, verified, stillFailing, explanations: explanations.map((e) => e.entry.id), before, after };
}

// ---------- Course workspace, help, errors ----------

async function openCourseWorkspace() {
  const course = await pickCourse(false);
  if (!course) return;
  const profile = PROFILES[course];
  if (process.env.CODESPACES === 'true') {
    vscode.window.showInformationMessage('You are in a codespace: your course folder is already open on the left.');
    return;
  }
  const picks: ActionItem[] = [
    {
      label: '$(folder-opened) Open a course folder already on this computer',
      detail: course === 'mc427' ? 'Your MC427 folder, usually in Documents' : 'The workspace folder you cloned, usually in Documents',
      action: () => vscode.commands.executeCommand('vscode.openFolder'),
    },
    {
      label: '$(repo-clone) Clone your copy from GitHub',
      detail: 'Paste the address of YOUR copy, not the template',
      action: () => vscode.commands.executeCommand('git.clone'),
    },
    {
      label: `$(github) Make your copy on GitHub first: ${profile.workspace.label}`,
      detail: profile.workspace.url,
      action: () => vscode.env.openExternal(vscode.Uri.parse(profile.workspace.url)),
    },
    {
      label: `$(book) Read the guide: ${profile.workspace.guideLabel}`,
      detail: profile.workspace.guideUrl,
      action: () => vscode.env.openExternal(vscode.Uri.parse(profile.workspace.guideUrl)),
    },
  ];
  const choice = await vscode.window.showQuickPick(picks, { title: `Open your ${profile.label} workspace` });
  await choice?.action?.();
}

async function getHelp() {
  const course = currentCourse();
  const picks: ActionItem[] = [
    {
      label: '$(question) Explain an R error',
      detail: 'Paste the message R printed and get a plain-English fix',
      action: () => explainErrorCommand(),
    },
    {
      label: '$(checklist) Check my setup',
      detail: 'Copy the report and paste it when you ask for help: it answers the first questions anyone would ask',
      action: () => checkSetupCommand(),
    },
  ];
  const profiles: CourseProfile[] = course ? [PROFILES[course]] : [PROFILES.mc451, PROFILES.mc427];
  for (const p of profiles) {
    picks.push({ label: p.label, kind: vscode.QuickPickItemKind.Separator });
    for (const h of p.help) {
      picks.push({ label: `$(link-external) ${h.label}`, detail: h.url, action: () => vscode.env.openExternal(vscode.Uri.parse(h.url)) });
    }
  }
  picks.push({ label: 'Your instructor', kind: vscode.QuickPickItemKind.Separator });
  picks.push({
    label: '$(mail) Still stuck after 15 minutes? Email your instructor or come to office hours',
    detail: 'Send the exact wording of the message, or a screenshot of the whole console. Office hours are on your syllabus.',
  });
  const shown = vscode.window.showQuickPick(picks, { title: 'Where to get help', matchOnDetail: true });
  markDone(DONE.help);
  const choice = await shown;
  await choice?.action?.();
}

async function explainErrorCommand(text?: string): Promise<string[]> {
  let input = text;
  if (input === undefined) {
    const editor = vscode.window.activeTextEditor;
    const sel = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
    const clip = sel ? '' : (await vscode.env.clipboard.readText()).slice(0, 2000);
    input = await vscode.window.showInputBox({
      title: 'Explain an R error',
      prompt: 'Paste the message R printed (copy it from the terminal first), then press Enter',
      value: sel || clip,
      ignoreFocusOut: true,
    });
    if (input === undefined) return [];
  }
  const found = explain(input, currentCourse());
  if (text === undefined) await showExplanations(found, undefined, input);
  return found.map((f) => f.entry.id);
}

async function showExplanations(found: Explanation[], heading?: string, original?: string) {
  const picks: ActionItem[] = [];
  for (const f of found) {
    picks.push({ label: f.entry.title, kind: vscode.QuickPickItemKind.Separator });
    picks.push({ label: `$(info) Why`, detail: f.entry.why });
    f.entry.fix.forEach((step, i) => picks.push({ label: `$(tools) Step ${i + 1}`, detail: step }));
    if (f.entry.link) {
      const url = f.entry.link.url;
      picks.push({ label: `$(link-external) ${f.entry.link.label}`, detail: url, action: () => vscode.env.openExternal(vscode.Uri.parse(url)) });
    }
  }
  if (found.length === 0) {
    picks.push({ label: 'Not in the table yet', kind: vscode.QuickPickItemKind.Separator });
    picks.push({
      label: '$(copy) Copy a question for your AI tool',
      detail: 'Fill in the line you ran, then paste it into Copilot Chat, Claude, or ChatGPT, and log it in your AI Use Log',
      action: async () => {
        await vscode.env.clipboard.writeText(
          `I am new to R. I ran this line: [your line]. R printed this: ${original ?? '[the message]'} What does it mean, and what should I check first?`,
        );
        vscode.window.showInformationMessage('Question copied.');
      },
    });
    picks.push({ label: '$(question) Where to get help', action: () => getHelp() });
  }
  const shown = vscode.window.showQuickPick(picks, {
    title: heading ?? (found.length ? `What this message means (${found.length} match${found.length > 1 ? 'es' : ''})` : 'No match for this message'),
    matchOnDetail: true,
    ignoreFocusOut: true,
  });
  if (!heading) markDone(DONE.help);
  const choice = await shown;
  await choice?.action?.();
}

// ---------- R terminal and the course script ----------

async function openRTerminal() {
  if (!(await requireTrust('opening an R terminal', openRTerminal))) return;
  const adapter = pickAdapter(setting('runWith', 'auto'), terminalAdapter);
  if (adapter.id === 'vscode-r') {
    // Not awaited: vscode-R's command can stay pending while its first-run step waits
    void vscode.commands.executeCommand('r.createRTerm');
  } else if (adapter.id === 'positron') {
    await vscode.commands.executeCommand('workbench.action.positronConsole.focusConsole');
  } else {
    if (!findR()[0]?.rterm) {
      vscode.window.showErrorMessage('R was not found. Run AURA: Check my setup to see why.');
      return;
    }
    terminalAdapter.open().show();
  }
}

async function runCourseSetupCheck() {
  if (!(await requireTrust('running the course setup script', runCourseSetupCheck))) return;
  const course = currentCourse() ?? (await pickCourse(false));
  if (!course) return;
  const script = PROFILES[course].setupScript;
  const code = script ? `source(${JSON.stringify(script)})` : 'v2v::setup()';
  if (script && !workspaceHas(script)) {
    vscode.window.showWarningMessage(`${script} is not in the open folder. Open your course folder with File, then Open Folder.`);
    return;
  }
  // The setup script always runs in this extension's own plain R terminal (or Positron's
  // console). In a fresh profile vscode-R's first terminal waited on its own first-run step and
  // never showed a prompt (2026-10-18, vscode-R 3.2.0), so the graded SETUP OK line could not
  // depend on it. The plain terminal was verified to run the script on Windows.
  const chosen = pickAdapter(setting('runWith', 'auto'), terminalAdapter);
  const adapter = chosen.id === 'positron' ? chosen : terminalAdapter;
  await adapter.runCode(code);
}

// ---------- Course files for an existing workspace (U9) ----------

export interface CourseFilesResult {
  folder: string;
  instructions: 'created' | 'kept';
  recommendations: string;
}

async function addCourseFiles(opts?: SilentOpts): Promise<CourseFilesResult | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    if (!opts?.silent) vscode.window.showWarningMessage('Open your course folder first (File, then Open Folder).');
    return undefined;
  }
  const course = opts?.course ?? (await pickCourse(false));
  if (!course) return undefined;
  const profile = PROFILES[course];
  if (!opts?.silent) {
    const b = await vscode.window.showInformationMessage(
      `Add the course's Copilot instructions and the extension recommendation to ${folder.name}? Nothing you wrote is replaced.`,
      'Add the files',
    );
    if (!b) return undefined;
  }
  const root = folder.uri;
  const exists = async (u: vscode.Uri) => {
    try {
      await vscode.workspace.fs.stat(u);
      return true;
    } catch {
      return false;
    }
  };

  // 1. .github/copilot-instructions.md, only when the student has none
  const instr = vscode.Uri.joinPath(root, '.github', 'copilot-instructions.md');
  let instructions: CourseFilesResult['instructions'] = 'kept';
  if (!(await exists(instr))) {
    const src = fs.readFileSync(resourcePath(path.join('course-files', profile.copilotInstructions)));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, '.github'));
    await vscode.workspace.fs.writeFile(instr, src);
    instructions = 'created';
  }

  // 2. .vscode/extensions.json, adding this extension to the recommendations
  const recUri = vscode.Uri.joinPath(root, '.vscode', 'extensions.json');
  const before = (await exists(recUri)) ? Buffer.from(await vscode.workspace.fs.readFile(recUri)).toString('utf8') : undefined;
  const merged = mergeRecommendations(before);
  if (merged.status === 'created' || merged.status === 'added') {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, '.vscode'));
    await vscode.workspace.fs.writeFile(recUri, Buffer.from(merged.text, 'utf8'));
  }
  const recommendations = merged.status === 'unreadable' ? `unchanged (${merged.reason})` : merged.status;
  output.appendLine(`Course files in ${root.fsPath}: copilot-instructions.md ${instructions}, extensions.json ${recommendations}`);

  if (!opts?.silent) {
    const parts = [
      instructions === 'created'
        ? 'Added .github/copilot-instructions.md.'
        : 'Kept your existing .github/copilot-instructions.md (not changed).',
      merged.status === 'unreadable'
        ? `Did not change .vscode/extensions.json: ${merged.reason}.`
        : merged.status === 'already'
          ? 'The extension was already recommended.'
          : 'Added the extension to .vscode/extensions.json.',
    ];
    const b = await vscode.window.showInformationMessage(
      `${parts.join(' ')} Commit the change in Source Control so it reaches GitHub.`,
      'Open the instructions',
    );
    if (b) await vscode.window.showTextDocument(instr);
  }
  return { folder: root.fsPath, instructions, recommendations };
}

// ---------- Updates and walkthrough ----------

// ---------- Check my test choice (R4) ----------

interface TestChoiceInput {
  outcome?: OutcomeKind;
  comparison?: ComparisonKind;
  chosenTest?: TestId;
}

// Owner decision U4 (coordinator default, auraR.testChoice = "check"): the student names the test
// they chose and the companion says whether it fits. "suggest" names the fitting test instead.
// Arguments skip the picks (tests and support); the verdict is returned either way.
async function checkTestChoiceCommand(input?: TestChoiceInput): Promise<{ fits?: boolean; fitting: TestId[]; reason: string } | undefined> {
  const mode = setting<string>('testChoice', 'check') === 'suggest' ? 'suggest' : 'check';
  const title = 'Check my test choice';
  const outcome =
    input?.outcome ??
    (
      await vscode.window.showQuickPick(
        (['numeric', 'categorical'] as OutcomeKind[]).map((k) => ({ label: OUTCOME_LABEL[k], k })),
        { title, placeHolder: 'Your outcome, the variable you are explaining or comparing, is' },
      )
    )?.k;
  if (!outcome) return undefined;
  const comparison =
    input?.comparison ??
    (
      await vscode.window.showQuickPick(
        (['categorical-two-groups', 'categorical-three-plus-groups', 'numeric'] as ComparisonKind[]).map((k) => ({ label: COMPARISON_LABEL[k], k })),
        { title, placeHolder: 'You compare it across, or predict it from,' },
      )
    )?.k;
  if (!comparison) return undefined;

  if (mode === 'suggest' && !input?.chosenTest) {
    const fitting = fittingTests(outcome, comparison);
    const reason = fitting.length
      ? `For these variables: ${fitting.map((t) => TEST_LABEL[t]).join(' or ')}.`
      : "None of the course's tests fits these variables. Check which one is the outcome.";
    if (!input) void vscode.window.showInformationMessage(reason);
    return { fitting, reason };
  }
  const chosenTest =
    input?.chosenTest ??
    (
      await vscode.window.showQuickPick(
        (Object.keys(TEST_LABEL) as TestId[]).map((t) => ({ label: TEST_LABEL[t], t })),
        { title, placeHolder: 'Which test did you choose?' },
      )
    )?.t;
  if (!chosenTest) return undefined;
  const verdict = checkTestChoice(outcome, comparison, chosenTest);
  output.appendLine(`Check my test choice: ${TEST_LABEL[chosenTest]}: ${verdict.fits ? 'fits' : 'does not fit'}. ${verdict.reason}`);
  if (!input) {
    const show = verdict.fits ? vscode.window.showInformationMessage : vscode.window.showWarningMessage;
    void show(`${verdict.fits ? 'Fits.' : 'Does not fit.'} ${verdict.reason}`);
  }
  return verdict;
}

async function checkForUpdatesCommand(automatic: boolean) {
  const source = installSource(ctx);
  if (source === 'gallery') {
    if (!automatic) await vscode.commands.executeCommand('workbench.extensions.action.checkForUpdates');
    return;
  }
  const url = setting<string>('updates.releaseUrl', '');
  if (!url) {
    if (!automatic) vscode.window.showInformationMessage('Update checks are off: this copy has no release address set.');
    return;
  }
  if (automatic) {
    const last = ctx.globalState.get<number>('auraR.lastUpdateCheck') ?? 0;
    if (Date.now() - last < 24 * 3600 * 1000) return;
    await ctx.globalState.update('auraR.lastUpdateCheck', Date.now());
  }
  const current = vscode.extensions.getExtension(EXT_ID)?.packageJSON?.version ?? '0.0.0';
  try {
    const r = await checkForUpdate(url, current);
    if (r.newer) {
      const b = await vscode.window.showInformationMessage(
        `AURA Lab R Companion ${r.latest} is available (you have ${current}).`,
        'Open the download page',
      );
      if (b && r.page) await vscode.env.openExternal(vscode.Uri.parse(r.page));
    } else if (!automatic) {
      vscode.window.showInformationMessage(`You have the newest version (${current}).`);
    }
  } catch (e: any) {
    if (!automatic) vscode.window.showWarningMessage(`Could not check for updates: ${e?.message ?? e}`);
  }
}

async function openWalkthrough() {
  await vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH, false);
}
