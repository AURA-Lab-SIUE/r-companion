// 0.7.3: the data folder in a course workspace copy (owner q-20261109-0117). Pure module, no VS Code.
// The fixtures copy the v2v-workspace template's top level as it stood at 8df0d93 (2026-10-31),
// which never had a data folder, plus a copy shaped like a student's: loose coding sheets at the top.
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { ensureDataFolder, isV2vWorkspace, dataFolderMessage } from '../src/dataFolder';

const TEMPLATE_FILES: Record<string, string> = {
  '00-check-your-setup.qmd': '---\ntitle: Check your setup\n---\n',
  '00_Inbox/README.md': '# 00_Inbox\n',
  '01_Journal/README.md': '# 01_Journal\n',
  '02_Literature/README.md': '# 02_Literature\n',
  '03_Project/README.md': '# 03_Project\n',
  '03_Project/01_Prospectus/README.md': '# 01_Prospectus\n',
  '03_Project/02_Codebook/README.md': '# 02_Codebook\n',
  '03_Project/03_Data/README.md': '# 03_Data\n',
  '03_Project/04_Drafts/README.md': '# 04_Drafts\n',
  '04_Resources/README.md': '# 04_Resources\n',
  '_templates/codebook.md': '# Codebook\n',
  '_templates/journal-entry.md': '# Journal entry\n',
  'README.md': '# v2v-workspace\n',
  'LICENSE': 'MIT\n',
};

// A student's copy: the template plus coding sheets saved at the top level, one with no extension
const STUDENT_FILES: Record<string, string> = {
  ...TEMPLATE_FILES,
  'both-passes.csv': 'id,tone_p1,tone_p2\n1,pos,pos\n',
  'Videos Codesheet.numbers': 'binary-ish\u0000bytes',
  'Song Codesheet.xlsx': 'PK\u0003\u0004',
  'notes': 'a file with no extension',
};

function makeTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v2vws-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

/** Every path under root (folders end in /) with a hash of each file, for before/after checks. */
function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (e.isDirectory()) {
        out.set(rel + '/', '');
        walk(full);
      } else {
        out.set(rel, crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'));
      }
    }
  };
  walk(root);
  return out;
}

/** The paths added between two snapshots, after checking nothing was removed or changed. */
function added(before: Map<string, string>, after: Map<string, string>): string[] {
  for (const [k, v] of before) assert.equal(after.get(k), v, `changed or removed: ${k}`);
  return [...after.keys()].filter((k) => !before.has(k)).sort();
}

test('a template copy is recognized; MC 427 and other folders are not', () => {
  assert.equal(isV2vWorkspace(makeTree(TEMPLATE_FILES)), true);
  assert.equal(isV2vWorkspace(makeTree({ 'mc427-setup-check.R': '', '00-check-your-setup.qmd': '', '03_Project/x': '' })), false);
  assert.equal(isV2vWorkspace(makeTree({ 'README.md': '', 'script.R': '' })), false);
  assert.equal(isV2vWorkspace(path.join(os.tmpdir(), 'no-such-folder-v2vws')), false);
});

test('a template copy gets one empty data folder, and a second run changes nothing', () => {
  const root = makeTree(TEMPLATE_FILES);
  const before = snapshot(root);
  assert.equal(ensureDataFolder(root), 'created');
  const mid = snapshot(root);
  assert.deepEqual(added(before, mid), ['data/']);
  assert.equal(ensureDataFolder(root), 'present');
  assert.deepEqual(added(mid, snapshot(root)), []);
});

test("a student's copy keeps every file where it was, byte for byte", () => {
  const root = makeTree(STUDENT_FILES);
  const before = snapshot(root);
  assert.equal(ensureDataFolder(root), 'created');
  assert.deepEqual(added(before, snapshot(root)), ['data/']);
  assert.ok(fs.existsSync(path.join(root, 'both-passes.csv')), 'the loose CSV is not moved');
});

test('an existing data folder and its files are left alone', () => {
  const root = makeTree({ ...STUDENT_FILES, 'data/coding-form.csv': 'id\n1\n', 'data/derived/x.csv': 'a\n' });
  const before = snapshot(root);
  assert.equal(ensureDataFolder(root), 'present');
  assert.deepEqual(added(before, snapshot(root)), []);
});

test('a folder named Data in another capitalization counts as present', () => {
  const root = makeTree({ ...TEMPLATE_FILES, 'Data/x.csv': 'a\n' });
  const before = snapshot(root);
  assert.equal(ensureDataFolder(root), 'present');
  assert.deepEqual(added(before, snapshot(root)), []);
});

test('a FILE named data blocks the folder and is not touched', () => {
  const root = makeTree({ ...TEMPLATE_FILES, data: 'not a folder' });
  const before = snapshot(root);
  assert.equal(ensureDataFolder(root), 'blocked');
  assert.deepEqual(added(before, snapshot(root)), []);
});

test('a folder that is not a course workspace gets nothing', () => {
  const root = makeTree({ 'README.md': '', 'analysis.R': '' });
  const before = snapshot(root);
  assert.equal(ensureDataFolder(root), 'not-course');
  assert.deepEqual(added(before, snapshot(root)), []);
});

test('the message names the folder and describes the guides, not an R default', () => {
  const m = dataFolderMessage();
  assert.match(m, /folder named data/);
  assert.match(m, /read_csv\(\) lines point to it/);
  assert.doesNotMatch(m, /R looks/);
});
