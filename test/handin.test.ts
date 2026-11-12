import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { bringTarget, buildZip, crc32, renderFolderProblem, zipFileList, zipNameFor, zipReport } from '../src/handIn';
import { panelTree } from '../src/panelModel';
import { menuItems } from '../src/catalog';
const menuItemsPure = (c: 'mc427' | 'mc451' | 'mc501') => menuItems(c, true);

function tmpTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-handin-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

/** Reads a ZIP back through its central directory, the way unzip tools do. */
function readZip(buf: Buffer): Record<string, Buffer> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out: Record<string, Buffer> = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off + 26);
    const body = buf.subarray(off + 30 + lnlen, off + 30 + lnlen + csize);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    assert.equal(crc32(data), crc, name);
    out[name] = data;
    p += 46 + nlen;
  }
  return out;
}

test('the ZIP list keeps the course work and skips Git, caches, package libraries, and the ZIP itself', () => {
  const root = tmpTree({
    'worksheet.qmd': 'x',
    'worksheet.html': 'x',
    'data/twitch_analysis.RDS': 'rds',
    'figures/a.png': 'png',
    '.git/HEAD': 'ref',
    '.Rproj.user/x': 'x',
    'renv/library/pkg/DESCRIPTION': 'x',
    'renv/activate.R': 'x',
    '.DS_Store': 'x',
    'out.zip': 'old',
  });
  assert.deepEqual(zipFileList(root, path.join(root, 'out.zip')), [
    'data/twitch_analysis.RDS',
    'figures/a.png',
    'renv/activate.R',
    'worksheet.html',
    'worksheet.qmd',
  ]);
});

test('the ZIP reads back byte for byte, with folders and a non-ASCII name', () => {
  const big = Buffer.from('message,length\n'.repeat(5000));
  const entries = [
    { name: 'data/coding-form.csv', data: big },
    { name: 'tiny.txt', data: Buffer.from('a') },
    { name: 'notas/año.md', data: Buffer.from('ñ') },
    { name: 'empty.txt', data: Buffer.alloc(0) },
  ];
  const back = readZip(buildZip(entries));
  assert.deepEqual(Object.keys(back), entries.map((e) => e.name));
  for (const e of entries) assert.ok(back[e.name].equals(e.data), e.name);
});

test('the ZIP is named after the course folder', () => {
  assert.equal(zipNameFor(path.join('C:', 'Users', 'me', 'mc451-workspace')), 'mc451-workspace.zip');
});

test('the ZIP report names the RDS and a worksheet with no HTML beside it, and says to upload one file', () => {
  const msg = zipReport(['data/twitch_analysis.RDS', 'describing.qmd', 'inferencing.qmd', 'inferencing.html'], '/tmp/x.zip', 2097152);
  assert.match(msg, /4 files, 2\.0 MB/);
  assert.match(msg, /holds data\/twitch_analysis\.RDS/);
  assert.match(msg, /beside describing\.qmd/);
  assert.doesNotMatch(msg, /beside inferencing\.qmd/);
  assert.match(msg, /Upload this one file/);
});

test('render: a worksheet in 03_Project that reads data/ gets the Execution halted warning; the top folder does not', () => {
  const root = tmpTree({ 'data/twitch_analysis.RDS': 'x', '03_Project/w.qmd': 'x' });
  const text = 'analysis <- read_rds("data/twitch_analysis.RDS")';
  assert.match(renderFolderProblem(path.join(root, '03_Project', 'w.qmd'), root, text)!, /folder 03_Project.*Execution halted/s);
  assert.equal(renderFolderProblem(path.join(root, 'w.qmd'), root, text), undefined);
  assert.equal(renderFolderProblem(path.join(root, '03_Project', 'w.qmd'), root, 'library(tidyverse)'), undefined);
  assert.equal(renderFolderProblem(path.join(root, '03_Project', 'w.qmd'), undefined, text), undefined);
});

test('bring a file in: data/ in MC 451 and MC 501, the top folder in MC 427', () => {
  const src = path.join('C:', 'Users', 'me', 'Downloads', 'twitch_analysis.RDS');
  const root = path.join('C:', 'work', 'ws');
  assert.deepEqual(bringTarget(root, 'mc451', src), { dest: path.join(root, 'data', 'twitch_analysis.RDS'), codePath: 'data/twitch_analysis.RDS' });
  assert.deepEqual(bringTarget(root, 'mc501', src).codePath, 'data/twitch_analysis.RDS');
  assert.deepEqual(bringTarget(root, 'mc427', src), { dest: path.join(root, 'twitch_analysis.RDS'), codePath: 'twitch_analysis.RDS' });
});

test('the panel: Bring a file in for every course; Preview, Render, and ZIP for MC 451 and MC 501 only; all four are AURA commands', () => {
  const ids = (c: 'mc427' | 'mc451' | 'mc501') => {
    const roots = panelTree({ course: c, items: menuItemsPure(c), crossCheck: c === 'mc427', banners: [] });
    const all: string[] = [];
    const walk = (n: { id: string; children?: any[] }) => { all.push(n.id); n.children?.forEach(walk); };
    roots.forEach(walk);
    return all;
  };
  for (const c of ['mc451', 'mc501'] as const) for (const id of ['data/bring', 'steps/preview', 'steps/render', 'steps/zip']) assert.ok(ids(c).includes(id), `${c} ${id}`);
  assert.ok(ids('mc427').includes('data/bring'));
  for (const id of ['steps/preview', 'steps/render', 'steps/zip']) assert.ok(!ids('mc427').includes(id), id);
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  for (const c of ['auraR.makeSubmissionZip', 'auraR.renderDocument', 'auraR.previewDocument', 'auraR.bringFileIn'])
    assert.ok(pkg.contributes.commands.some((x: any) => x.command === c && x.category === 'AURA'), c);
});
