// AURA: Make a help report (0.5.4). Pure: no VS Code API, so the unit tests load it directly.
//
// A student runs it and emails the result to the instructor, who picks the fix from it. It holds
// setup facts and log lines only: no file from the workspace, the home folder shown as ~, and the
// computer's user name replaced everywhere. VS Code gives extensions no way to read a terminal's
// text, so the report asks for R console errors separately.

export const REPORT_TITLE = 'AURA Lab R Companion help report';
export const LAST_LINE = 'Paste this whole report into an email to Dr. Leith.';
export const TERMINAL_NOTE =
  'VS Code does not let extensions read what an R terminal shows. If R printed an error, copy it from the terminal and paste it under this report, or attach a screenshot.';
export const USER_MARK = '<user>';
const LOG_LINES = 50;

export interface Redaction {
  home: string;
  user: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Hides who the student is: the home folder becomes ~ (with either slash, and doubled backslashes
 * as JSON writes them), then any other appearance of the user name becomes <user>.
 */
export function redact(text: string, r: Redaction): string {
  let out = text;
  const home = r.home.replace(/[\\/]+$/, '');
  if (home.length > 3) {
    const parts = home.split(/[\\/]+/).filter(Boolean).map(escapeRe);
    // C:\Users\name, C:/Users/name, and C:\\Users\\name are the same folder
    const sep = '(?:\\\\\\\\|\\\\|/)';
    const lead = /^[\\/]/.test(home) ? sep : '';
    out = out.replace(new RegExp(lead + parts.join(sep) + '(?![A-Za-z0-9_.-])', 'gi'), '~');
  }
  const user = r.user.trim();
  if (user.length >= 2) {
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(user)}(?![A-Za-z0-9])`, 'gi'), USER_MARK);
  }
  return out;
}

/** The last lines written to an output channel, which VS Code gives no way to read back. */
export class RecentLines {
  private lines: string[] = [];
  private partial = '';
  constructor(private readonly keep = 200) {}
  add(text: string): void {
    const parts = (this.partial + text).split(/\r?\n/);
    this.partial = parts.pop() ?? '';
    this.lines.push(...parts);
    if (this.lines.length > this.keep) this.lines.splice(0, this.lines.length - this.keep);
  }
  last(n: number): string[] {
    const all = this.partial ? [...this.lines, this.partial] : this.lines;
    return all.slice(-n);
  }
}

/** Error and warning lines from the R extension's logs, oldest first, the last n of them. */
export function errorLines(logs: { file: string; text: string }[], n = LOG_LINES): string[] {
  const out: string[] = [];
  for (const log of logs) {
    for (const line of log.text.split(/\r?\n/)) {
      if (/\b(error|warn(ing)?|fail(ed|ure)?|exception|ECONNRESET|cannot|could not)\b/i.test(line)) out.push(`${log.file}: ${line.trim()}`);
    }
  }
  return out.slice(-n);
}

export interface PackageLine {
  name: string;
  version: string | null;
  /** sess only: the vscode-R source revision it was built from. */
  revision?: string | null;
}

export interface ReportInput {
  when: Date;
  /** (a) Check my setup's plain-text report, or why it did not run. */
  setup: string;
  /** (b) versions */
  os: string;
  vscode: string;
  companion: string;
  /** undefined: not installed or turned off */
  rExtension?: string;
  r?: { version: string; path: string; source: string };
  libPaths: string[];
  packages: PackageLine[];
  /** (c) attach state, already in words */
  attach: string[];
  /** (d) the Companion's own log */
  companionLog: string[];
  /** (e) the R extension's error and warning lines */
  rExtensionLog: string[];
}

export interface Section {
  title: string;
  body: string[];
}

/** The report's sections, in order. */
export function reportSections(i: ReportInput): Section[] {
  const pkg = (p: PackageLine) =>
    `${p.name}: ${p.version ?? 'not installed'}${p.revision ? ` (revision ${p.revision.replace(/^git-tree:/, '').slice(0, 7)})` : ''}`;
  return [
    { title: '1. Check my setup', body: i.setup.split(/\r?\n/) },
    {
      title: '2. Versions',
      body: [
        `Operating system: ${i.os}`,
        `VS Code: ${i.vscode}`,
        `R Companion: ${i.companion}`,
        `R extension (REditorSupport.r): ${i.rExtension ?? 'not installed or turned off'}`,
        i.r ? `R: ${i.r.version}, found through ${i.r.source} (${i.r.path})` : 'R: not found',
        `R libraries (.libPaths()): ${i.libPaths.length ? i.libPaths.join('; ') : 'unknown'}`,
        ...i.packages.map(pkg),
      ],
    },
    { title: '3. Connection between R and VS Code', body: i.attach },
    { title: `4. R Companion log (last ${LOG_LINES} lines)`, body: i.companionLog.length ? i.companionLog.slice(-LOG_LINES) : ['(empty)'] },
    {
      title: `5. R extension log: errors and warnings (last ${LOG_LINES}, this and the previous VS Code session)`,
      body: i.rExtensionLog.length ? i.rExtensionLog.slice(-LOG_LINES) : ['(none found)'],
    },
    { title: '6. Errors in the R terminal', body: [TERMINAL_NOTE] },
  ];
}

/** The whole report as plain text, redacted, ending with the line that says where to send it. */
export function buildReport(i: ReportInput, r: Redaction): string {
  const lines = [
    REPORT_TITLE,
    `Made ${i.when.toLocaleString()}. Read it over before you send it: your home folder shows as ~ and your user name as ${USER_MARK}.`,
    '',
  ];
  for (const s of reportSections(i)) {
    lines.push(`== ${s.title} ==`, ...s.body, '');
  }
  lines.push(LAST_LINE);
  return redact(lines.join('\n'), r);
}
