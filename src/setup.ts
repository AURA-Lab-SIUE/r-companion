// Check my setup and Install what is missing (R1). Moved out of extension.ts in 0.5.3 with no change
// in behavior; the host passes in how it finds and runs R and what it does when the check passes.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CourseId, PROFILES, packageNames, PackageSpec } from './profiles';
import { RCandidate } from './rDiscovery';
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
  QUARTO_EXT_ID,
  versionBelow,
  VSCODE_R_ID,
  VSCODE_R_MIN,
} from './checklist';
import { explain, Explanation } from './errors';
import { inPositron } from './adapters';
import { installScript } from './installScript';
import { bundledSessPath, managedReady, parseRevision, SESS_IMPORTS, sessItems } from './sess';

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

export interface SilentOpts {
  silent?: boolean;
  course?: CourseId;
  includeRecommended?: boolean;
  packages?: string[];
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** What the setup commands need from the host extension. */
export interface SetupHost {
  output: vscode.OutputChannel;
  storageDir: string;
  findR: () => RCandidate[];
  runRscript: (
    rscript: string,
    args: string[],
    opts?: { onData?: (s: string) => void; token?: vscode.CancellationToken; timeoutMs?: number },
  ) => Promise<RunResult>;
  resourcePath: (name: string) => string;
  pickCourse: (alwaysAsk: boolean) => Promise<CourseId | undefined>;
  workspaceHas: (file: string) => boolean;
  cranMirror: () => string;
  /** The check found nothing to fix (ticks the walkthrough step). */
  onSetupOk: () => void;
  /** Every finished check, for the AURA panel's status line. */
  onChecked?: (result: CheckResult) => void;
  runCourseSetupCheck: () => Promise<unknown>;
  showExplanations: (found: Explanation[], heading?: string) => Promise<void>;
}

let host: SetupHost;

export function initSetup(h: SetupHost): void {
  host = h;
}

// ---------- Check my setup ----------

export async function runCheck(course: CourseId, progress?: vscode.Progress<{ message?: string }>): Promise<CheckResult> {
  const profile = PROFILES[course];
  const candidates = host.findR();
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
  // vscode-R 3.x connects R through sess, so the probe also looks up sess's own imports
  const vscodeR = vscode.extensions.getExtension(VSCODE_R_ID);
  const vscodeRVersion: string | undefined = vscodeR?.packageJSON?.version;
  const wantsSess = !inPositron() && vscodeRVersion !== undefined && !versionBelow(vscodeRVersion, VSCODE_R_MIN);
  const names = [...new Set([...packageNames(profile), ...(wantsSess ? SESS_IMPORTS : [])])];
  const res = await host.runRscript(r.rscript, [host.resourcePath('probe.R'), names.join(','), profile.runV2vSetup ? '1' : '0'], {
    timeoutMs: 180000,
  });
  let probe: ProbeResult;
  try {
    probe = parseProbeOutput(res.stdout);
  } catch (e) {
    host.output.appendLine(res.stdout);
    host.output.appendLine(res.stderr);
    throw new Error(`R was found at ${r.rscript} but the check could not read its answer. The output panel has R's own message.`);
  }
  const items = buildChecklist(profile, probe, {
    rscript: r.rscript,
    rSource: r.source,
    vscodeRInstalled: vscodeR !== undefined,
    vscodeRVersion,
    inPositron: inPositron(),
    setupScriptInWorkspace: profile.setupScript ? host.workspaceHas(profile.setupScript) : undefined,
    quartoExtension: vscode.extensions.getExtension(QUARTO_EXT_ID) !== undefined,
  });
  if (wantsSess && vscodeR) items.push(...sessItems(sessFacts(vscodeR.extensionPath, vscodeRVersion as string, probe, packageNames(profile))));
  const text = renderText(profile, probe, items, new Date());
  return { course, r, probe, items, text, failing: items.filter(isFailing).map((i) => i.name) };
}

/** What the sess check needs, read from disk: the bundled copy, vscode-R's managed library, settings. */
function sessFacts(vscodeRFolder: string, vscodeRVersion: string, probe: ProbeResult, alreadyListed: string[]) {
  const src = bundledSessPath(vscodeRFolder);
  let revision: string | null = null;
  try {
    revision = parseRevision(fs.readFileSync(path.join(src, 'DESCRIPTION'), 'utf8'));
  } catch {
    revision = null;
  }
  // vscode-R's global storage sits beside this extension's (the folder name is its id, lowercased)
  const storageRoot = path.dirname(host.storageDir);
  const roots = ['reditorsupport.r', VSCODE_R_ID].map((d) => path.join(storageRoot, d));
  return {
    vscodeRVersion,
    sessionWatcher: vscode.workspace.getConfiguration('r').get<boolean>('sessionWatcher', true),
    bundled: revision ? { path: src, revision } : undefined,
    rVersion: probe.r.version,
    libraryCopies: probe.sess ?? [],
    managedReady: !!revision && roots.some((root) => managedReady(root, probe.r.platform, probe.r.version, revision as string)),
    packages: probe.packages,
    alreadyListed,
  };
}

export async function checkSetupCommand(opts?: SilentOpts): Promise<CheckResult | undefined> {
  const course = opts?.course ?? (await host.pickCourse(false));
  if (!course) return undefined;
  let result: CheckResult;
  try {
    result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'AURA: Checking your setup' },
      (progress) => runCheck(course, progress),
    );
  } catch (e: any) {
    host.output.appendLine(`Setup check failed: ${e?.message ?? e}`);
    if (!opts?.silent) {
      vscode.window.showErrorMessage(`${e?.message ?? e}`, 'Show output').then((b) => b && host.output.show());
    }
    throw e;
  }
  host.output.appendLine(result.text);
  host.output.appendLine('');
  if (result.failing.length === 0) host.onSetupOk();
  host.onChecked?.(result);
  if (!opts?.silent) void showChecklist(result);
  return result;
}

export type ActionItem = vscode.QuickPickItem & { action?: () => Thenable<unknown> | void };

const ICON: Record<string, string> = {
  ok: '$(pass)',
  missing: '$(error)',
  outdated: '$(arrow-circle-up)',
  broken: '$(error)',
  warn: '$(warning)',
  info: '$(info)',
};

export async function showChecklist(result: CheckResult): Promise<void> {
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
  for (const it of result.items.filter((i) => i.showExtension && isFailing(i))) {
    picks.push({
      label: `$(extensions) Show the ${it.name.replace(/ for VS Code$/, '')}`,
      detail: 'Opens it in the Extensions view, where you select Install or Enable',
      action: () => vscode.commands.executeCommand('workbench.extensions.search', `@id:${it.showExtension}`),
    });
  }
  if (recommended.length > 0) {
    picks.push({
      label: `$(cloud-download) Install the recommended packages too (${recommended.length})`,
      detail: recommended.map((p) => p.name).join(', '),
      action: () => installMissingCommand({ course: result.course, includeRecommended: true }),
    });
  }
  if (profile.setupScript && host.workspaceHas(profile.setupScript)) {
    picks.push({
      label: `$(play) Run ${profile.setupScript} in an R terminal`,
      detail: 'The course check that prints SETUP OK, for your screenshot',
      action: () => host.runCourseSetupCheck(),
    });
  }
  picks.push({ label: '$(copy) Copy this report', detail: 'Paste it when you ask for help', action: () => copyReport(result) });
  picks.push({
    label: '$(report) Make a help report',
    detail: 'This check plus versions and error logs, ready to email to your instructor',
    action: () => vscode.commands.executeCommand('auraR.makeHelpReport'),
  });
  picks.push({ label: '$(output) Show the full report', action: () => host.output.show() });
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

export async function installMissingCommand(opts?: SilentOpts): Promise<InstallResult | undefined> {
  const course = opts?.course ?? (await host.pickCourse(false));
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

  const mirror = host.cranMirror();
  fs.mkdirSync(host.storageDir, { recursive: true });
  const scriptPath = path.join(host.storageDir, 'install-missing.R');
  fs.writeFileSync(scriptPath, installScript(plan, mirror));
  host.output.show(true);
  host.output.appendLine(`Installing ${plan.map((p) => p.name).join(', ')} with R at ${before.r.rscript}`);
  host.output.appendLine(`Script: ${scriptPath}`);

  const res = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `AURA: Installing ${plan.length} package(s). This can take several minutes.`,
      cancellable: true,
    },
    (progress, token) =>
      host.runRscript(before.r!.rscript, [scriptPath], {
        token,
        onData: (s) => {
          host.output.append(s);
          const last = s.trim().split(/\r?\n/).pop();
          if (last) progress.report({ message: last.slice(0, 80) });
        },
      }),
  );
  host.output.appendLine(`R finished (exit code ${res.code}). Checking the library now; the exit code alone proves nothing.`);
  return finishInstall(course, plan, res, before, exts, opts);
}

/** Installs a VS Code extension and waits until VS Code reports it, so the re-check can see it. */
export async function installExtension(id: string): Promise<void> {
  host.output.appendLine(`Installing the VS Code extension ${id}`);
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
    host.output.appendLine(`Could not install ${id}: ${e?.message ?? e}`);
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
  const updatedExts = before.items
    .filter((i) => i.status === 'outdated' && i.installableExtension && exts.includes(i.installableExtension))
    .map((i) => i.name);
  const attempted = [...plan.map((p) => p.name), ...extNames];
  const failingAfter = new Set(after.items.filter(isFailing).map((i) => i.name));
  const missingAfter = new Set(after.items.filter((i) => i.installable && i.status !== 'ok').map((i) => i.name));
  const verified = attempted.filter((n) => !failingAfter.has(n) && !missingAfter.has(n));
  const stillFailing = attempted.filter((n) => !verified.includes(n));
  host.output.appendLine(`Verified from the library: ${verified.join(', ') || 'none'}`);
  if (stillFailing.length) host.output.appendLine(`Still not installed: ${stillFailing.join(', ')}`);
  // Only when something is still missing: a clean install log names the yaml package and prints
  // remotes' "Rtools is required" warning, so a successful install printed two wrong causes.
  if (stillFailing.length) {
    for (const e of explanations) host.output.appendLine(`Possible cause: ${e.entry.title}. ${e.entry.fix.join(' ')}`);
  }

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
    } else if (stillFailing.length > 0 && stillFailing.every((n) => updatedExts.includes(n))) {
      // An extension that was already installed keeps reporting its old version until the window
      // reloads, so the re-check cannot see an update yet
      void vscode.window
        .showInformationMessage(
          `VS Code finishes updating the ${stillFailing.join(', ')} when the window reloads. Select Reload Window, then run AURA: Check my setup again.`,
          'Reload Window',
        )
        .then((b) => b && vscode.commands.executeCommand('workbench.action.reloadWindow'));
    } else if (stillFailing.every((n) => extNames.includes(n))) {
      // VS Code asks the student to trust the extension's publisher; Cancel there lands here
      void vscode.window
        .showWarningMessage(
          `The ${stillFailing.join(', ')} is not installed yet. Select Install again, then Trust Publisher & Install.`,
          'Install again',
        )
        .then((b) => b && installMissingCommand({ course }));
    } else {
      void host.showExplanations(explanations, `Still not installed: ${stillFailing.join(', ')}`);
    }
  }
  return { attempted, verified, stillFailing, explanations: explanations.map((e) => e.entry.id), before, after };
}
