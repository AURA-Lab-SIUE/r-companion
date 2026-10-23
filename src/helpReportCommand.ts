// AURA: Make a help report (0.5.4): gathers the sections helpReport.ts lays out. Reads only setup
// facts and log files; it writes nothing and runs R only through Rscript (the probe).

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CourseId, PROFILES } from './profiles';
import { RCandidate } from './rDiscovery';
import { parseProbeOutput, VSCODE_R_ID } from './checklist';
import { runCheck, RunResult } from './setup';
import { buildReport, errorLines, PackageLine, RecentLines } from './helpReport';

/** The R packages whose versions the instructor asks about first. */
export const REPORT_PACKAGES = ['sess', 'languageserver', 'v2v', 'processx', 'later', 'jsonlite', 'rstudioapi'];

export interface ReportHost {
  recent: RecentLines;
  currentCourse: () => CourseId | undefined;
  findR: () => RCandidate[];
  runRscript: (rscript: string, args: string[], opts?: { timeoutMs?: number }) => Promise<RunResult>;
  resourcePath: (name: string) => string;
  /** This extension's log folder: <logs>/<session>/window<N>/exthost/<extension id>. */
  logDir: string;
  companionVersion: string;
  attachLines: () => string[];
}

/** The tail of a file, so a long log never fills memory. */
function tail(file: string, bytes = 256 * 1024): string {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The R extension's own log files from this VS Code session and the one before: its folder under
 * each window's exthost, and the extension host log's lines that name it (activation failures).
 */
export function rExtensionLogs(logDir: string): { file: string; text: string }[] {
  const session = path.resolve(logDir, '..', '..', '..');
  const root = path.dirname(session);
  const withWindows = (d: string) => {
    try {
      return fs.readdirSync(path.join(root, d)).some((w) => /^window\d+$/.test(w));
    } catch {
      return false;
    }
  };
  const sessions = fs.readdirSync(root).filter(withWindows).sort();
  const here = sessions.indexOf(path.basename(session));
  const pick = here > 0 ? sessions.slice(here - 1, here + 1) : here === 0 ? [sessions[0]] : sessions.slice(-2);
  const out: { file: string; text: string }[] = [];
  for (const s of pick) {
    for (const w of fs.readdirSync(path.join(root, s)).filter((x) => /^window\d+$/.test(x))) {
      const exthost = path.join(root, s, w, 'exthost');
      const own = path.join(exthost, VSCODE_R_ID);
      if (fs.existsSync(own)) {
        for (const f of fs.readdirSync(own).filter((x) => x.endsWith('.log'))) {
          out.push({ file: `${s}/${w}/${f}`, text: tail(path.join(own, f)) });
        }
      }
      const host = path.join(exthost, 'exthost.log');
      if (fs.existsSync(host)) {
        const lines = tail(host).split(/\r?\n/).filter((l) => /REditorSupport/i.test(l));
        if (lines.length) out.push({ file: `${s}/${w}/exthost.log`, text: lines.join('\n') });
      }
    }
  }
  return out;
}

export async function makeHelpReport(h: ReportHost): Promise<string> {
  const course = h.currentCourse();
  let setup: string;
  if (!course) {
    setup = 'No course picked yet. Run AURA: Pick my course, then make the report again.';
  } else {
    try {
      setup = (await runCheck(course)).text;
    } catch (e: any) {
      setup = `Check my setup for ${PROFILES[course].label} did not finish: ${e?.message ?? e}`;
    }
  }
  const r = h.findR()[0];
  let libPaths: string[] = [];
  let packages: PackageLine[] = REPORT_PACKAGES.map((name) => ({ name, version: null }));
  let rLine: { version: string; path: string; source: string } | undefined;
  if (r) {
    try {
      const res = await h.runRscript(r.rscript, [h.resourcePath('probe.R'), REPORT_PACKAGES.join(','), '0'], { timeoutMs: 120000 });
      const probe = parseProbeOutput(res.stdout);
      libPaths = probe.libPaths;
      rLine = { version: probe.r.version, path: r.rscript, source: r.source };
      packages = REPORT_PACKAGES.map((name) => {
        const p = probe.packages.find((x) => x.name === name);
        const version = p && p.installed ? p.version : null;
        return name === 'sess' ? { name, version, revision: probe.sess?.[0]?.revision ?? null } : { name, version };
      });
    } catch (e: any) {
      rLine = { version: `unknown (R did not answer: ${e?.message ?? e})`, path: r.rscript, source: r.source };
    }
  }
  let rExtensionLog: string[];
  try {
    rExtensionLog = errorLines(rExtensionLogs(h.logDir));
  } catch (e: any) {
    rExtensionLog = [`(could not read the log folder: ${e?.message ?? e})`];
  }
  return buildReport(
    {
      when: new Date(),
      setup,
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      vscode: `${vscode.version} (${vscode.env.appName})`,
      companion: h.companionVersion,
      rExtension: vscode.extensions.getExtension(VSCODE_R_ID)?.packageJSON?.version,
      r: rLine,
      libPaths,
      packages,
      attach: h.attachLines(),
      companionLog: h.recent.last(50),
      rExtensionLog,
    },
    { home: os.homedir(), user: os.userInfo().username },
  );
}
