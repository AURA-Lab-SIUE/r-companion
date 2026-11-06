// Turns the probe's JSON into a checklist. Pure: no VS Code API, no processes.

import { CourseProfile, compareVersions, PackageSpec } from './profiles';

export interface ProbePackage {
  name: string;
  installed: boolean;
  version: string | null;
  loads: boolean;
  error: string | null;
  path?: string | null;
}

export interface ProbeResult {
  r: { version: string; string: string; home: string; platform: string };
  libPaths: string[];
  libWritable: boolean[];
  userLib: string | null;
  packages: ProbePackage[];
  quarto: string | null;
  git: string | null;
  v2vSetup: { lines: string[] | null; error: string | null };
  /** sess copies in .libPaths() with their vscode-R source revision (probe.R since 0.5.4). */
  sess?: { lib: string; revision: string | null }[];
  /** macOS only (probe.R since 0.7.1): XQuartz, Apple's Command Line Tools, Apple silicon. null elsewhere. */
  mac?: MacFacts | null;
}

export interface MacFacts {
  xquartz: boolean;
  clt: boolean;
  appleSilicon: boolean;
}

/** XQuartz's own download page (CRAN's R for macOS page links it for X11 and tcltk). */
export const XQUARTZ_URL = 'https://www.xquartz.org';
/** CRAN's R for macOS page: the Apple silicon (arm64) and Intel (x86_64) installers. */
export const CRAN_MAC_URL = 'https://cloud.r-project.org/bin/macosx/';

export type Status = 'ok' | 'missing' | 'outdated' | 'broken' | 'warn' | 'info';

export interface CheckItem {
  /** Short name: "R", "tidyverse", "Quarto". */
  name: string;
  status: Status;
  /** One line, plain English, readable without the icon. */
  detail: string;
  /** Group heading in the checklist. */
  group: 'R' | 'Required R packages' | 'Recommended R packages' | 'Programs' | 'VS Code' | 'v2v::setup()';
  /** The package this item can install, when "Install what is missing" can fix it. */
  installable?: PackageSpec;
  /** The VS Code extension this item can install, when "Install what is missing" can fix it. */
  installableExtension?: string;
  /** An extension to show in the Extensions view (Install or Enable), when installing alone cannot fix it. */
  showExtension?: string;
}

/** vscode-R. Every course's setup guide installs it (v2v-hub install-r Step 2; the MC 427 software list). */
export const VSCODE_R_ID = 'REditorSupport.r';
/** The Quarto extension: the Render button and preview for .qmd files (course page install-quarto, step 2). */
export const QUARTO_EXT_ID = 'quarto.quarto';
/** The first vscode-R that attaches to R 4.6 and newer. */
export const VSCODE_R_MIN = '3.0.0';

/** True when version a is below b, comparing the numeric parts (3.3.20261018 is above 3.0.0). */
export function versionBelow(a: string, b: string): boolean {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

export interface ExtraFacts {
  rscript: string;
  rSource: string;
  vscodeRInstalled: boolean;
  /** The installed vscode-R version (its package.json), when VS Code reports one. */
  vscodeRVersion?: string;
  inPositron: boolean;
  setupScriptInWorkspace?: boolean;
  /** Scopes where vscode-R's r.bracketedPaste is on (pasteGuard.ts); empty or absent when it is off. */
  bracketedPasteOn?: string[];
  /** The Quarto extension is installed and enabled (VS Code reports a disabled one as absent). */
  quartoExtension?: boolean;
}

const BEGIN = '@@AURA_PROBE_BEGIN@@';
const END = '@@AURA_PROBE_END@@';

/** Pulls the JSON out of Rscript's output. Throws with a readable message when it is not there. */
export function parseProbeOutput(stdout: string): ProbeResult {
  const start = stdout.indexOf(BEGIN);
  const end = stdout.indexOf(END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error('R ran, but the setup check did not print its result.');
  }
  const json = stdout.slice(start + BEGIN.length, end).trim();
  return JSON.parse(json) as ProbeResult;
}

/** The status words students read. Every item carries one, so nothing depends on color or icon. */
export const STATUS_WORD: Record<Status, string> = {
  ok: 'OK',
  missing: 'MISSING',
  outdated: 'NEEDS UPDATE',
  broken: 'BROKEN',
  warn: 'CHECK',
  info: 'NOTE',
};

export function buildChecklist(profile: CourseProfile, probe: ProbeResult, extra: ExtraFacts): CheckItem[] {
  const items: CheckItem[] = [];
  const rOk = compareVersions(probe.r.version, profile.minR) >= 0;
  items.push({
    name: 'R',
    group: 'R',
    status: rOk ? 'ok' : 'outdated',
    detail: rOk
      ? `R ${probe.r.version}, found through ${extra.rSource} (${extra.rscript})`
      : `R ${probe.r.version} is older than ${profile.minR}. Install the current R from cloud.r-project.org, then run Check my setup again.`,
  });

  const byName = new Map(probe.packages.map((p) => [p.name, p]));
  for (const spec of profile.packages) {
    const p = byName.get(spec.name);
    const group = spec.level === 'required' ? 'Required R packages' : 'Recommended R packages';
    const missingStatus: Status = spec.level === 'required' ? 'missing' : 'warn';
    if (!p || !p.installed) {
      items.push({
        name: spec.name,
        group,
        status: missingStatus,
        detail: `not installed (${spec.why})`,
        installable: spec,
      });
    } else if (!p.loads) {
      items.push({
        name: spec.name,
        group,
        status: 'broken',
        detail: `installed but does not load: ${firstLine(p.error)}`,
        installable: spec,
      });
    } else if (spec.minVersion && p.version && compareVersions(p.version, spec.minVersion) < 0) {
      items.push({
        name: spec.name,
        group,
        status: 'outdated',
        detail: `version ${p.version} is installed; the course uses ${spec.minVersion} or newer`,
        installable: spec,
      });
    } else {
      items.push({ name: spec.name, group, status: 'ok', detail: `version ${p.version ?? 'unknown'} (${spec.why})` });
    }
  }

  if (profile.needsQuarto) {
    items.push({
      name: 'Quarto',
      group: 'Programs',
      status: probe.quarto ? 'ok' : 'missing',
      detail: probe.quarto
        ? `found at ${probe.quarto}`
        : 'not found. Quarto is a program, not an R package: install it from quarto.org, then quit VS Code completely and open it again.',
    });
  }
  // MC 451 and MC 501 render .qmd files; Positron brings its own Quarto support
  if (profile.needsQuarto && !extra.inPositron && extra.quartoExtension !== undefined) {
    items.push({
      name: 'Quarto extension for VS Code',
      group: 'VS Code',
      status: extra.quartoExtension ? 'ok' : 'missing',
      detail: extra.quartoExtension
        ? 'is installed and turned on (the Render button for .qmd files)'
        : 'is not installed or is turned off. Select Show the Quarto extension below, then Install or Enable.',
      showExtension: extra.quartoExtension ? undefined : QUARTO_EXT_ID,
    });
  }
  // On a Mac /usr/bin/git is always there, but without Apple's Command Line Tools it only opens an
  // install prompt, so "found" alone is not "works" (0.7.1)
  const mac = probe.mac ?? undefined;
  const gitStub = !!mac && !mac.clt && probe.git === '/usr/bin/git';
  if (profile.needsGit) {
    items.push({
      name: 'Git',
      group: 'Programs',
      status: probe.git && !gitStub ? 'ok' : 'missing',
      detail: gitStub
        ? `${CLT_FIX} Git on a Mac comes with them.`
        : probe.git
          ? `found at ${probe.git}`
          : 'not found. Install Git from git-scm.com (on Windows choose the middle PATH option), then quit VS Code completely and open it again.',
    });
  }
  if (mac) items.push(...macItems(mac, probe.r.platform, profile.needsGit));

  // Required in VS Code for every course; Positron replaces it with its own R support
  // Before 3.0.0 it never attaches to R 4.6 or newer, so the Workspace panel stays empty and the
  // status bar reads "R: (not attached)" (vscode-R issues 1696 and 1723, fixed in 3.0.0, 2026-09-27)
  if (!extra.inPositron) {
    const tooOld = extra.vscodeRInstalled && extra.vscodeRVersion !== undefined && versionBelow(extra.vscodeRVersion, VSCODE_R_MIN);
    items.push({
      name: 'R extension for VS Code',
      group: 'VS Code',
      status: !extra.vscodeRInstalled ? 'missing' : tooOld ? 'outdated' : 'ok',
      detail: !extra.vscodeRInstalled
        ? 'the R extension by REditorSupport is not installed. Install what is missing adds it.'
        : tooOld
          ? `version ${extra.vscodeRVersion} is installed, and versions before ${VSCODE_R_MIN} cannot connect to R 4.6. Install what is missing updates it.`
          : `REditorSupport R extension${extra.vscodeRVersion ? ` ${extra.vscodeRVersion}` : ''} is installed (Ctrl+Enter runs a line)`,
      installableExtension: extra.vscodeRInstalled && !tooOld ? undefined : VSCODE_R_ID,
    });
  }

  if (!extra.inPositron && extra.bracketedPasteOn && extra.bracketedPasteOn.length) {
    items.push({
      name: 'R: Bracketed Paste',
      group: 'VS Code',
      status: 'broken',
      detail: `is on (${extra.bracketedPasteOn.join(', ')} settings), so plain R prints 00~ and 01~ (Mac) or [200~ and [201~ (Windows) around each line you run. Open Settings (Cmd+, on a Mac, Ctrl+, on Windows), click the Workspace tab, search for bracketed, and untick R: Bracketed Paste.`,
    });
  }

  if (profile.setupScript && extra.setupScriptInWorkspace !== undefined) {
    items.push({
      name: profile.setupScript,
      group: 'VS Code',
      status: extra.setupScriptInWorkspace ? 'ok' : 'info',
      detail: extra.setupScriptInWorkspace
        ? 'is in your open folder. Run it with "AURA: Run the course setup check script" for your screenshot.'
        : 'is not in the open folder. Open your MC427 folder with File, then Open Folder.',
    });
  }

  if (profile.runV2vSetup) {
    items.push(...v2vSetupItems(probe));
  }
  // One heading per group: rows were pushed in check order, so a course's extra required package
  // (effectsize) and the Git row came after other groups, and the report printed "Required R
  // packages", "Programs", and "VS Code" twice each (testbench, MC 451, 2026-10-31)
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => GROUP_ORDER.indexOf(a.it.group) - GROUP_ORDER.indexOf(b.it.group) || a.i - b.i)
    .map((x) => x.it);
}

const CLT_FIX =
  "Apple's Command Line Tools are not installed. Open Terminal, run xcode-select --install, click Install, wait for it to finish, then quit VS Code completely and open it again.";

/** The Mac-only rows: Command Line Tools, XQuartz, and an Intel R on an Apple silicon Mac (0.7.1). */
export function macItems(mac: MacFacts, rPlatform: string, needsGit: boolean): CheckItem[] {
  const out: CheckItem[] = [];
  if (!mac.clt && !needsGit) {
    // With Git in the course, the Git row already says this
    out.push({ name: 'Command Line Tools', group: 'Programs', status: 'warn', detail: `${CLT_FIX} R needs them only to build a package from source.` });
  }
  out.push({
    name: 'XQuartz',
    group: 'Programs',
    status: mac.xquartz ? 'ok' : 'warn',
    detail: mac.xquartz
      ? 'is installed (View() can open a table window)'
      : `is not installed. Only View() needs it: without it, View(data) stops with "X11 library is missing". Install it from ${XQUARTZ_URL}, log out of your Mac and back in, then open VS Code again. Until then, glimpse(data) shows every column.`,
  });
  if (mac.appleSilicon && /^x86_64/.test(rPlatform)) {
    out.push({
      name: 'R for Apple silicon',
      group: 'R',
      status: 'warn',
      detail: `This R is the Intel build, running on your Apple silicon Mac through Rosetta, so it is slow. From ${CRAN_MAC_URL} install the arm64 build (macOS 14 or newer: the R-...-arm64.pkg at the top; macOS 11 to 13: the big-sur-arm64 folder), then run Install what is missing, because packages install again for the new R.`,
    });
  }
  return out;
}

const GROUP_ORDER: CheckItem['group'][] = ['R', 'Required R packages', 'Recommended R packages', 'Programs', 'VS Code', 'v2v::setup()'];

/** v2v::setup() output, one checklist line per tick or cross. Headings become groups in the text. */
export function v2vSetupItems(probe: ProbeResult): CheckItem[] {
  if (probe.v2vSetup.error) {
    return [
      {
        name: 'v2v::setup()',
        group: 'v2v::setup()',
        status: 'info',
        detail: probe.v2vSetup.error === 'v2v is not installed' ? 'runs once v2v is installed' : `did not run: ${firstLine(probe.v2vSetup.error)}`,
      },
    ];
  }
  const out: CheckItem[] = [];
  let section = '';
  for (const raw of probe.v2vSetup.lines ?? []) {
    const line = raw.trimEnd();
    const head = /^-- (.+?) -*$/.exec(line);
    if (head) {
      section = head[1];
      continue;
    }
    const m = /^([vx!i]) (.+)$/.exec(line);
    if (!m) continue;
    const status: Status = m[1] === 'v' ? 'ok' : m[1] === 'x' ? 'missing' : m[1] === '!' ? 'warn' : 'info';
    // (missing), (missing, recommended), and since v2v 0.3.5 (missing, needed in VS Code)
    const name = m[2].replace(/ \(missing[^)]*\)$/, '');
    const item: CheckItem = { name, group: 'v2v::setup()', status, detail: section || 'v2v::setup()' };
    // A package line setup() flags can be installed from CRAN like any other
    if (status !== 'ok' && /R packages/i.test(section) && /^[A-Za-z][A-Za-z0-9.]*$/.test(name)) {
      item.installable = {
        name,
        why: 'listed by v2v::setup()',
        level: /Required/i.test(section) ? 'required' : 'recommended',
        source: 'cran',
      };
    }
    out.push(item);
  }
  return out;
}

export function firstLine(s: string | null | undefined): string {
  return (s ?? '').split(/\r?\n/)[0].slice(0, 200);
}

export function isFailing(item: CheckItem): boolean {
  return item.status === 'missing' || item.status === 'outdated' || item.status === 'broken';
}

/** Everything "Install what is missing" can fix, required first, deduplicated. */
export function installPlan(items: CheckItem[], includeRecommended: boolean): PackageSpec[] {
  const specs = items
    .filter((i) => i.installable && (isFailing(i) || (includeRecommended && i.status === 'warn')))
    .map((i) => i.installable as PackageSpec);
  const seen = new Set<string>();
  return specs.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)));
}

/** The VS Code extensions "Install what is missing" adds. */
export function extensionPlan(items: CheckItem[]): string[] {
  return [...new Set(items.filter((i) => i.installableExtension && isFailing(i)).map((i) => i.installableExtension as string))];
}

/** The plain-text report written to the output channel and copied to the clipboard. */
export function renderText(profile: CourseProfile, probe: ProbeResult, items: CheckItem[], when: Date): string {
  const lines: string[] = [];
  lines.push(`AURA Lab R Companion: setup check for ${profile.label}`);
  lines.push(`Checked ${when.toLocaleString()} on ${probe.r.platform}`);
  lines.push('');
  let group = '';
  for (const it of items) {
    if (it.group !== group) {
      group = it.group;
      lines.push(`${group}`);
    }
    lines.push(`  [${STATUS_WORD[it.status]}] ${it.name}: ${it.detail}`);
  }
  lines.push('');
  const failing = items.filter(isFailing);
  lines.push(
    failing.length === 0
      ? 'RESULT: everything this course needs is installed.'
      : `RESULT: ${failing.length} item(s) to fix: ${failing.map((f) => f.name).join(', ')}.`,
  );
  // MC 427 grades this exact line, so it is printed on its own as the last line
  if (profile.resultLines) {
    lines.push(failing.length === 0 ? profile.resultLines.ok : profile.resultLines.notReady);
  }
  return lines.join('\n');
}
