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
import { CourseId, CourseProfile, PROFILES, COURSE_IDS, courseSetMessage, isCourseId } from './profiles';
import { discoverR, systemEnv, RCandidate } from './rDiscovery';
import { STATUS_WORD } from './checklist';
import { ActionItem, CheckResult, initSetup, installMissingCommand, installExtension, checkSetupCommand, runCheck, RunResult, SilentOpts } from './setup';
import { VSCODE_R_ID, VSCODE_R_MIN, versionBelow } from './checklist';
import { explain, Explanation, explanationMarkdown, FixIt, FIX_IT_LABEL } from './errors';
import { pickAdapter, TerminalAdapter } from './adapters';
import { mergeRecommendations } from './courseFiles';
import { TrustGate } from './trustGate';
import { registerMenus, menuItems, stepsScript } from './menus';
import { registerPanel, AuraPanel } from './panel';
import { openDataViewer, ViewerDeps } from './dataViewer';
import { registerCopilotTools, CopilotToolsSetting } from './copilotTools';
import { checkTestChoice, ComparisonKind, OutcomeKind, TestId, TEST_LABEL, OUTCOME_LABEL, COMPARISON_LABEL } from './testChoice';

const EXT_ID = 'aura-lab-siue.r-companion';
const WALKTHROUGH = `${EXT_ID}#getStarted`;

let output: vscode.OutputChannel;
let terminalAdapter: TerminalAdapter;
let ctx: vscode.ExtensionContext;
let trustGate: TrustGate;
let panel: AuraPanel | undefined;

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
    vscode.workspace.registerTextDocumentContentProvider(EXPLAIN_SCHEME, explainPages),
  );

  initSetup({
    output,
    storageDir: context.globalStorageUri.fsPath,
    findR,
    runRscript,
    resourcePath,
    pickCourse,
    workspaceHas,
    cranMirror: () => setting<string>('cranMirror', 'https://cloud.r-project.org'),
    onSetupOk: () => markDone(DONE.setup),
    onChecked: (r) => panel?.setSetupLine(setupLine(r)),
    runCourseSetupCheck,
    showExplanations,
  });

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
  reg('auraR.openWalkthrough', () => openWalkthrough());
  reg('auraR.addCourseFiles', (opts?: SilentOpts) => addCourseFiles(opts));
  // The Fix it buttons beside an explanation; not in the Command Palette (tests and support)
  reg('auraR.fixIt', (fix: FixIt) => runFixIt(fix));
  const viewerDeps: ViewerDeps = {
    rscript: () => findR()[0]?.rscript,
    bridgeScript: resourcePath('bridge.R'),
    mediaRoot: path.join(context.extensionPath, 'media', 'grid'),
    output,
  };
  reg('auraR.openDataViewer', (file?: string) => openDataViewer(context, viewerDeps, typeof file === 'string' ? file : undefined));
  // For tests and support: which run adapter and install source this copy sees
  reg('auraR.diagnostics', () => ({
    adapter: pickAdapter(setting('runWith', 'auto'), terminalAdapter).id,
    r: findR(),
    course: currentCourse(),
    walkthroughDone: [...doneKeys],
    waitingForTrust: trustGate.waiting,
    panel: panel?.roots(),
  }));
  // R2/R3/R4 code-generation menus and the reliability grid (workstream E)
  registerMenus(context, {
    output,
    currentCourse,
    pickCourse,
    runRscript: (rscript, args, timeoutMs) => runRscript(rscript, args, { timeoutMs }),
    rscriptPath: () => findR()[0]?.rscript,
    runInSession: (code) => runInSession(code),
    requireTrust,
    resourcePath,
    storageDir: context.globalStorageUri.fsPath,
    apaCheck: () => setting<boolean>('apaCheck', true),
  });
  reg('auraR.checkTestChoice', (input?: TestChoiceInput) => checkTestChoiceCommand(input));
  // The AURA panel in the Activity Bar (0.5.3): a second door to the same commands
  panel = registerPanel(context, {
    currentCourse,
    items: (course) => menuItems(course, setting<boolean>('apaCheck', true)),
    crossCheck: (course) => course === 'mc427',
    stepsScript: () => {
      const s = stepsScript();
      return s === undefined ? undefined : path.basename(typeof s === 'string' ? s : s.fileName);
    },
  });
  reg('auraR.openLink', (url: unknown) => typeof url === 'string' && vscode.env.openExternal(vscode.Uri.parse(url)));
  reg('auraR.openWorkspaceView', () => openWorkspaceView());
  reg('auraR.fixNotAttached', () => fixNotAttached());
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
  void vscode.commands.executeCommand('setContext', 'auraR.courseSet', true);
  panel?.refresh();
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
  picks.push({ label: 'Accessibility', kind: vscode.QuickPickItemKind.Separator });
  picks.push({
    label: '$(accessibility) Keyboard and screen reader tips',
    detail: "The coding sheet keys, focus mode for NVDA and JAWS, and Alt+F1 for VS Code's own accessibility help",
    action: () => openHelpPage('Keyboard and screen reader tips', ACCESSIBILITY_TIPS),
  });
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

// The Accessibility row in Where to get help (0.5.3): what jamovi's keyboard guide and RStudio's
// accessibility menu give their users, for the parts of VS Code the R Companion adds.
const ACCESSIBILITY_TIPS = [
  '# Keyboard and screen reader tips',
  '',
  '## Everywhere in VS Code',
  '',
  '- Every R Companion command is in the Command Palette: press Ctrl+Shift+P (Cmd+Shift+P on a Mac) and type AURA.',
  "- Press Alt+F1 (Option+F1 on a Mac) for VS Code's own accessibility help about the part of the screen you are in.",
  '',
  '## The data viewer and coding sheet',
  '',
  '- Arrow keys move between cells. Home and End go to the start and end of a row.',
  '- In a column with a list of codes, type the first letters of a code and press Enter to save it and move down.',
  '- Tab moves right, Escape cancels, F2 shows the whole list, and Delete clears a cell.',
  '- Ctrl+Z (Cmd+Z on a Mac) undoes the last change. Work saves by itself.',
  '',
  '## Screen readers in the coding sheet',
  '',
  '- NVDA: press NVDA+Space to switch to focus mode, so your keys go to the grid and not the screen reader.',
  '- JAWS: press Insert+Z to turn the virtual cursor off, for the same reason, or let JAWS switch to forms mode when it enters the grid.',
  '- The chosen code is read out after you press Enter.',
  '',
].join('\n');

async function openHelpPage(title: string, markdown: string): Promise<void> {
  const uri = vscode.Uri.from({ scheme: EXPLAIN_SCHEME, path: `/${title}.md` });
  explainPages.put(uri, markdown);
  try {
    await vscode.commands.executeCommand('markdown.showLockedPreviewToSide', uri);
  } catch {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: vscode.ViewColumn.Beside });
  }
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

// The full explanation opens as a read-only Markdown preview beside the script (0.5.1). The quick
// pick shows each row on one line and cut every Why and Step with an ellipsis, so it is kept only
// for choosing among several matches. A preview rather than a modal dialog: the steps are things to
// do in the editor and terminal, and a modal blocks both until it is closed, while the preview
// stays open beside the code. A screen reader reads it as a page (headings, a paragraph, a numbered
// list, a link), the keyboard reaches the link with Tab, and Ctrl+W closes it. The page is a
// virtual document, so nothing is written to the student's folder.
const EXPLAIN_SCHEME = 'aura-explain';

class ExplainPages implements vscode.TextDocumentContentProvider {
  private readonly pages = new Map<string, string>();
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;
  put(uri: vscode.Uri, text: string) {
    this.pages.set(uri.toString(), text);
    this.changed.fire(uri);
  }
  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.pages.get(uri.toString()) ?? '# This explanation is no longer open\n\nRun AURA: Explain an R error again.\n';
  }
}
const explainPages = new ExplainPages();

async function openExplanation(x: Explanation): Promise<void> {
  const uri = vscode.Uri.from({ scheme: EXPLAIN_SCHEME, path: `/R error explained - ${x.entry.id}.md` });
  explainPages.put(uri, explanationMarkdown(x));
  output.appendLine(`Explained: ${x.entry.title}`);
  try {
    await vscode.commands.executeCommand('markdown.showLockedPreviewToSide', uri);
    // The preview takes keyboard focus as it opens, then loses it about 0.3 s later when its page
    // loads (only the first preview of a session kept it, on Pythia 2026-10-19). Focusing the group
    // again once the page has loaded keeps keyboard and screen-reader focus on the explanation.
    // Only while the preview is still the active tab, so a student who has clicked away keeps focus.
    const label = `R error explained - ${x.entry.id}.md`;
    for (const ms of [700, 1500]) {
      setTimeout(() => {
        const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (tab && tab.input instanceof vscode.TabInputWebview && tab.label.includes(label)) {
          void vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        }
      }, ms);
    }
  } catch {
    // No Markdown preview (the built-in Markdown extension is turned off): the same page as read-only text
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  }
  // A Markdown page cannot carry a button, so a fix the extension can make itself is offered here
  const fix = x.entry.fixIt;
  if (fix) {
    void vscode.window
      .showInformationMessage(`The R Companion can do this for you: ${FIX_IT_LABEL[fix]}.`, FIX_IT_LABEL[fix])
      .then((b) => b && runFixIt(fix));
  }
}

/** The AURA panel's status line: "MC 451, R 4.5.2, everything installed" or "2 items to fix". */
function setupLine(r: CheckResult): string {
  const parts = [PROFILES[r.course].short];
  if (r.probe) parts.push(`R ${r.probe.r.version}`);
  parts.push(r.failing.length === 0 ? 'everything installed' : `${r.failing.length} item${r.failing.length === 1 ? '' : 's'} to fix`);
  return parts.join(', ');
}

// Rank 6, owner q-20261022-0005 = A: the environment view is vscode-R's Workspace panel. The
// Companion opens it rather than building a second one. vscode-R reports no attach state through
// any API, so the panel node says it is empty until R is attached, and its sibling runs the fix.
async function openWorkspaceView(): Promise<void> {
  if (!vscode.extensions.getExtension(VSCODE_R_ID)) {
    const b = await vscode.window.showWarningMessage(
      "The Workspace panel comes with the R extension for VS Code, which is not installed. Install what is missing adds it.",
      'Install what is missing',
    );
    if (b) await installMissingCommand();
    return;
  }
  await vscode.commands.executeCommand('workspaceViewer.focus');
}

/** R shows (not attached)? The version check, the update, then a fresh R terminal and the steps. */
async function fixNotAttached(): Promise<void> {
  const version: string | undefined = vscode.extensions.getExtension(VSCODE_R_ID)?.packageJSON?.version;
  if (!version || versionBelow(version, VSCODE_R_MIN)) {
    await runFixIt('update-r-extension');
    return;
  }
  const found = explain('R: (not attached)');
  if (found[0]) await openExplanation(found[0]);
  void vscode.commands.executeCommand('r.createRTerm');
}

/** R terminals the extension or vscode-R opened. */
function rTerminals(): vscode.Terminal[] {
  return vscode.window.terminals.filter((t) => /(^|\s)R(\s|$)|R Interactive|R \(AURA\)/.test(t.name));
}

/** The one-click fixes beside an explanation (0.5.3). Returns what was done, for tests and support. */
async function runFixIt(fix: FixIt): Promise<string> {
  output.appendLine(`Fix it: ${FIX_IT_LABEL[fix]}`);
  switch (fix) {
    case 'turn-off-bracketed-paste': {
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showWarningMessage('Open your course folder first (File, then Open Folder), then try again.');
        return 'no folder';
      }
      // Edits .vscode/settings.json in place, keeping its comments and the student's other settings
      await vscode.workspace.getConfiguration('r').update('bracketedPaste', false, vscode.ConfigurationTarget.Workspace);
      const closed = rTerminals();
      closed.forEach((t) => t.dispose());
      vscode.window.showInformationMessage(
        `Bracketed paste is off for this folder${closed.length ? ', and the R terminal was closed' : ''}. The next Run it opens a clean R terminal.`,
      );
      return `bracketedPaste false, closed ${closed.length}`;
    }
    case 'close-r-and-install': {
      const closed = rTerminals();
      closed.forEach((t) => t.dispose());
      await installMissingCommand();
      return `closed ${closed.length}, installed`;
    }
    case 'update-r-extension': {
      await installExtension(VSCODE_R_ID);
      await checkSetupCommand();
      return 'updated, checked';
    }
  }
}

async function showExplanations(found: Explanation[], heading?: string, original?: string) {
  if (!heading) markDone(DONE.help);
  // One match: nothing to choose, so the explanation opens straight away
  if (found.length === 1) {
    if (heading) void vscode.window.showWarningMessage(heading);
    await openExplanation(found[0]);
    return;
  }
  const picks: ActionItem[] = [];
  for (const f of found) {
    picks.push({
      label: `$(info) ${f.entry.title}`,
      detail: f.entry.why,
      action: () => openExplanation(f),
    });
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
  const choice = await vscode.window.showQuickPick(picks, {
    title: heading ?? (found.length ? `${found.length} explanations match this message. Pick one to read it in full.` : 'No match for this message'),
    placeHolder: found.length ? 'Pick the explanation to open beside your code' : undefined,
    matchOnDetail: true,
    ignoreFocusOut: true,
  });
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

/**
 * "Run it" on an inserted block. With no R session running, a block sent through vscode-R never
 * reached R: in the 0.4.0 R2 video the first block's text was lost, and on Pythia (2026-10-19,
 * vscode-R 3.3.20261018) r.runCommand first asked where to run, then its new "R Interactive"
 * terminal showed R's banner but no prompt and never ran the block (why is not known). So when no
 * R terminal is open, the block goes to this extension's own R terminal, which waits for R to
 * start before sending (the same wait the setup script uses). With an R terminal already open,
 * the block goes where it went before: vscode-R's terminal through r.runCommand, else the
 * companion's terminal.
 */
async function runInSession(code: string): Promise<void> {
  const adapter = pickAdapter(setting('runWith', 'auto'), terminalAdapter);
  if (adapter.id === 'positron') return adapter.runCode(code);
  if (adapter.id === 'vscode-r' && vscodeRTerminalOpen()) return adapter.runCode(code);
  if (adapter.id === 'vscode-r' && !terminalAdapter.isOpen()) {
    if (!findR()[0]?.rterm) {
      vscode.window.showErrorMessage('R was not found. Run AURA: Check my setup to see why.');
      return;
    }
    output.appendLine('No R terminal was open: opened the R (AURA) terminal and waited for R before running the block.');
  }
  return terminalAdapter.runCode(code);
}

/** A live terminal vscode-R made ("R Interactive") or one its commands send to ("R"). */
function vscodeRTerminalOpen(): boolean {
  return vscode.window.terminals.some((t) => t.exitStatus === undefined && (t.name === 'R Interactive' || t.name === 'R'));
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

// Owner decision U4: the student names the test they chose and the companion says whether it fits;
// it never names the test for them, because choosing it is graded. Arguments skip the picks (tests
// and support); the verdict is returned either way.
async function checkTestChoiceCommand(input?: TestChoiceInput): Promise<{ fits?: boolean; fitting: TestId[]; reason: string } | undefined> {
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

async function openWalkthrough() {
  await vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH, false);
}
