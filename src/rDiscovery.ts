// Finding R on the student's computer.
//
// Order (the same order vscode-R uses, plus the standard install folders as a last resort):
//   1. this extension's auraR.rPath setting
//   2. the R extension's r.rpath.<os> and r.rterm.<os> settings
//   3. the PATH
//   4. Windows: the registry (HKLM and HKCU, R-core\R and R-core\R64), then Program Files
//      and the per-user install folder
//      macOS: R.framework, /usr/local/bin, /opt/homebrew/bin
//      Linux: /usr/local/bin, /usr/bin
// The Windows R installer leaves R off the PATH on purpose (install-r.qmd), so step 4 is the
// one that usually finds R on a student's Windows laptop.
// No VS Code API here: settings come in as plain values, so the unit tests can run this.

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { compareVersions } from './profiles';

export type Platform = 'win32' | 'darwin' | 'linux';

export interface RCandidate {
  /** Full path to Rscript (Rscript.exe on Windows). */
  rscript: string;
  /** Full path to the R console program in the same folder, when it exists. */
  rterm?: string;
  /** Where the candidate came from, shown to the student. */
  source: string;
}

export interface DiscoverySettings {
  auraRPath?: string;
  rpath?: string; // r.rpath.<os>
  rterm?: string; // r.rterm.<os>
}

export interface DiscoveryEnv {
  platform: Platform;
  pathVar: string;
  exists: (p: string) => boolean;
  /** Returns InstallPath values from the Windows registry. Empty elsewhere. */
  registryInstallPaths: () => string[];
  /** Lists a directory's entries, or [] when it does not exist. */
  listDir: (p: string) => string[];
  env: Record<string, string | undefined>;
}

const exe = (platform: Platform, name: string) => (platform === 'win32' ? `${name}.exe` : name);

/** Given any R-ish executable path (R, R.exe, Rterm.exe, Rscript), the Rscript beside it. */
export function rscriptBeside(p: string, platform: Platform, exists: (p: string) => boolean): RCandidate | undefined {
  if (!p) return undefined;
  const cleaned = p.trim().replace(/^"(.*)"$/, '$1');
  if (!cleaned) return undefined;
  const pathMod = platform === 'win32' ? path.win32 : path.posix;
  const base = pathMod.basename(cleaned).toLowerCase();
  let dir = pathMod.dirname(cleaned);
  // A folder was given instead of a program
  if (!/\.(exe)$/.test(base) && !/^(r|rscript|rterm)$/.test(base)) {
    dir = cleaned;
  }
  const tries = [dir, pathMod.join(dir, 'bin'), pathMod.join(dir, 'bin', 'x64')];
  for (const d of tries) {
    const rscript = pathMod.join(d, exe(platform, 'Rscript'));
    if (exists(rscript)) {
      const rtermName = platform === 'win32' ? 'R.exe' : 'R';
      const rterm = pathMod.join(d, rtermName);
      return { rscript, rterm: exists(rterm) ? rterm : undefined, source: '' };
    }
  }
  return undefined;
}

/** Picks the newest R-x.y.z folder name from a list. */
export function newestRFolder(names: string[]): string | undefined {
  const versions = names
    .map((n) => /^R-(\d+\.\d+\.\d+)$/.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => compareVersions(b[1], a[1]));
  return versions.length ? versions[0][0] : undefined;
}

/** Every candidate, in priority order, deduplicated. The first one is the one to use. */
export function discoverR(settings: DiscoverySettings, env: DiscoveryEnv): RCandidate[] {
  const out: RCandidate[] = [];
  const seen = new Set<string>();
  const add = (p: string | undefined, source: string) => {
    if (!p) return;
    const c = rscriptBeside(p, env.platform, env.exists);
    if (!c) return;
    const key = env.platform === 'win32' ? c.rscript.toLowerCase() : c.rscript;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...c, source });
  };
  const pathMod = env.platform === 'win32' ? path.win32 : path.posix;

  add(settings.auraRPath, 'the auraR.rPath setting');
  add(settings.rpath, 'the R extension setting r.rpath');
  add(settings.rterm, 'the R extension setting r.rterm');

  const sep = env.platform === 'win32' ? ';' : ':';
  for (const dir of env.pathVar.split(sep).filter(Boolean)) {
    const candidate = pathMod.join(dir, exe(env.platform, 'Rscript'));
    if (env.exists(candidate)) add(candidate, 'your PATH');
  }

  if (env.platform === 'win32') {
    for (const p of env.registryInstallPaths()) add(p, 'the Windows registry');
    const roots = [
      env.env['ProgramFiles'] ? pathMod.join(env.env['ProgramFiles'] as string, 'R') : 'C:\\Program Files\\R',
      env.env['LOCALAPPDATA'] ? pathMod.join(env.env['LOCALAPPDATA'] as string, 'Programs', 'R') : undefined,
    ].filter((r): r is string => !!r);
    for (const root of roots) {
      const newest = newestRFolder(env.listDir(root));
      if (newest) add(pathMod.join(root, newest), 'the standard install folder');
    }
  } else if (env.platform === 'darwin') {
    add('/Library/Frameworks/R.framework/Resources/bin/Rscript', 'the standard install folder');
    add('/usr/local/bin/Rscript', 'the standard install folder');
    add('/opt/homebrew/bin/Rscript', 'the standard install folder');
  } else {
    add('/usr/local/bin/Rscript', 'the standard install folder');
    add('/usr/bin/Rscript', 'the standard install folder');
  }
  return out;
}

/** Reads R's InstallPath values from the Windows registry with reg.exe. Newest version first. */
export function readWindowsRegistry(): string[] {
  const keys = [
    'HKLM\\SOFTWARE\\R-core\\R64',
    'HKLM\\SOFTWARE\\R-core\\R',
    'HKCU\\SOFTWARE\\R-core\\R64',
    'HKCU\\SOFTWARE\\R-core\\R',
  ];
  const found: string[] = [];
  for (const key of keys) {
    try {
      const outText = cp.execFileSync('reg.exe', ['query', key, '/v', 'InstallPath'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const m = /InstallPath\s+REG_SZ\s+(.+)/i.exec(outText);
      if (m) found.push(m[1].trim());
    } catch {
      // Key absent: nothing to add
    }
  }
  return found;
}

/** The real environment, for use inside VS Code. */
export function systemEnv(): DiscoveryEnv {
  const platform = (process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux') as Platform;
  return {
    platform,
    pathVar: process.env.PATH ?? process.env.Path ?? '',
    exists: (p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    },
    registryInstallPaths: platform === 'win32' ? readWindowsRegistry : () => [],
    listDir: (p) => {
      try {
        return fs.readdirSync(p);
      } catch {
        return [];
      }
    },
    env: process.env,
  };
}
