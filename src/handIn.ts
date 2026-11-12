// Hand-in steps every graded R assignment needs (audit 2026-11-12, fixes F1 to F3):
// make one submission ZIP, render or preview the open .qmd, and bring a file into the course folder.
// The helpers above the vscode section are pure so the unit tests can run them without VS Code.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';

// ---------- ZIP (F1) ----------

/** Folders and files a submission ZIP leaves out: Git history, R and Quarto caches, and package libraries. */
export const ZIP_SKIP_DIRS = new Set(['.git', '.Rproj.user', '.quarto', 'node_modules', '.Rhistory_cache', '.vscode-test']);
export const ZIP_SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db', '.Rhistory']);

/** Every file under root, as forward-slash paths relative to root, skipping ZIP_SKIP_* and renv/library. */
export function zipFileList(root: string, skipAbs?: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(root, rel);
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (ZIP_SKIP_DIRS.has(e.name) || r === 'renv/library' || r === 'renv/staging') continue;
        walk(r);
      } else if (e.isFile()) {
        if (ZIP_SKIP_FILES.has(e.name)) continue;
        if (skipAbs && path.resolve(root, r) === path.resolve(skipAbs)) continue;
        out.push(r);
      }
    }
  };
  walk('');
  return out.sort();
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** A standard ZIP (deflate, UTF-8 names) of the given entries. No ZIP64: a course folder stays far below 4 GB. */
export function buildZip(entries: { name: string; data: Buffer; mtime?: Date }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const deflated = zlib.deflateRawSync(e.data);
    const store = deflated.length >= e.data.length;
    const body = store ? e.data : deflated;
    const { time, date } = dosTime(e.mtime ?? new Date());
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(store ? 0 : 8, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(store ? 0 : 8, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, body);
    centrals.push(ch, name);
    offset += lh.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** The default ZIP name: the course folder's name, so the instructor can tell whose it is. */
export function zipNameFor(root: string): string {
  return `${path.basename(path.resolve(root))}.zip`;
}

/** What the student should hear after the ZIP is made, including the checks the assignment pages ask for. */
export function zipReport(files: string[], zipPath: string, bytes: number): string {
  const mb = (bytes / 1048576).toFixed(1);
  const parts = [`Made ${path.basename(zipPath)} (${files.length} files, ${mb} MB) in ${path.dirname(zipPath)}.`];
  const qmd = files.filter((f) => /\.qmd$/i.test(f) && !f.includes('/'));
  const missingHtml = qmd.filter((q) => !files.includes(q.replace(/\.qmd$/i, '.html')));
  if (files.includes('data/twitch_analysis.RDS')) parts.push('It holds data/twitch_analysis.RDS.');
  if (missingHtml.length > 0) parts.push(`No HTML file sits beside ${missingHtml.join(', ')}. Render it first if the assignment asks for the HTML.`);
  parts.push('Upload this one file to the assignment in Blackboard.');
  return parts.join(' ');
}

// ---------- Render and preview (F2) ----------

/**
 * A worksheet in a subfolder that reads "data/..." will stop with "Execution halted" when Quarto renders it,
 * because Quarto starts R in the worksheet's own folder. Returns the warning, or undefined when it is fine.
 */
export function renderFolderProblem(qmdPath: string, root: string | undefined, text: string): string | undefined {
  if (!root) return undefined;
  const dir = path.resolve(path.dirname(qmdPath));
  if (dir === path.resolve(root)) return undefined;
  if (!/["']data\//.test(text)) return undefined;
  if (fs.existsSync(path.join(dir, 'data'))) return undefined;
  const rel = path.relative(root, dir).replace(/\\/g, '/');
  return (
    `This worksheet is in the folder ${rel}. It reads files from data/, and Quarto looks for data/ next to the worksheet, ` +
    'so the render will stop with "Execution halted". Move the worksheet to the top of your course folder, next to the data folder, and render it there.'
  );
}

// ---------- Bring a file in (F3) ----------

/** Where a brought-in file goes: data/ in an MC 451 or MC 501 workspace, the top folder in MC 427. */
export function bringTarget(root: string, course: string | undefined, file: string): { dest: string; codePath: string } {
  const name = path.basename(file);
  if (course === 'mc427') return { dest: path.join(root, name), codePath: name };
  return { dest: path.join(root, 'data', name), codePath: `data/${name}` };
}

export function downloadsFolder(): string {
  const d = path.join(os.homedir(), 'Downloads');
  return fs.existsSync(d) ? d : os.homedir();
}
