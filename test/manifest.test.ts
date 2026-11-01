// 0.6.0 owner decisions in the extension manifest (#rgui, 2026-10-31).

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));

test('Ctrl+Enter runs in the R terminal the Companion opened (q-20261031-0016)', () => {
  // Without it, the first Ctrl+Enter after Run it opened vscode-R's "Choose where to run" picker,
  // whose default started a new, empty R session (testbench, 2026-10-31, toggled)
  assert.equal(manifest.contributes.configurationDefaults?.['r.alwaysUseActiveTerminal'], true);
});

test("vscode-R's own languageserver prompt is off; Install what is missing is the one path (q-20261031-0017)", () => {
  assert.equal(manifest.contributes.configurationDefaults?.['r.lsp.promptToInstall'], false);
});

test('one product name on the Activity Bar icon and the panel (q-20261031-0019)', () => {
  const [container] = manifest.contributes.viewsContainers.activitybar;
  const [view] = manifest.contributes.views[container.id];
  assert.equal(manifest.displayName, 'AURA Lab R Companion');
  assert.equal(container.title, 'AURA Lab R Companion');
  assert.equal(view.name, 'AURA Lab R Companion');
});

// Ctrl+Enter must land in R on every path (Iolaus 2026-10-31, after #mc427rightsize read vscode-R
// 3.2.2): with r.alwaysUseActiveTerminal on, vscode-R sends to the active terminal of ANY kind (a
// PowerShell one included), and with no terminal it says "There are no open terminals." and runs
// nothing. So the Companion owns vscode-R's run keys in R files: it makes an R terminal active
// (opening R (AURA) if none) and then runs vscode-R's own command.
const VSCODE_R_RUN_KEYS: Array<[string, string, string]> = [
  ['ctrl+enter', 'r.runSelection', "editorTextFocus && editorLangId == 'r'"],
  ['ctrl+enter', 'r.runSelection', "editorTextFocus && editorLangId == 'rmd'"],
  ['alt+enter', 'r.runSelectionRetainCursor', "editorTextFocus && editorLangId == 'r'"],
  ['ctrl+shift+enter', 'r.runCurrentChunk', "editorTextFocus && editorLangId == 'rmd'"],
  ['ctrl+alt+p', 'r.runAboveChunks', "editorTextFocus && (editorLangId == 'rmd' || editorLangId == 'r')"],
  ['shift+ctrl+s', 'r.runSource', "editorTextFocus && editorLangId == 'r'"],
  ['shift+ctrl+enter', 'r.runSourcewithEcho', "editorTextFocus && editorLangId == 'r'"],
  ['ctrl+alt+b', 'r.runFromBeginningToLine', "editorTextFocus && editorLangId == 'r'"],
  ['ctrl+alt+e', 'r.runFromLineToEnd', "editorTextFocus && editorLangId == 'r'"],
];

test("every vscode-R run key in an R file goes through the Companion's R-terminal step", () => {
  const kb: Array<{ key: string; command: string; args?: string; when?: string }> = manifest.contributes.keybindings ?? [];
  for (const [key, cmd, when] of VSCODE_R_RUN_KEYS) {
    const hit = kb.find((k) => k.key.toLowerCase() === key && k.command === 'auraR.runInR' && k.args === cmd && k.when === when);
    assert.ok(hit, `${key} ${cmd} [${when}]`);
  }
});

test('auraR.runInR is declared and kept out of the Command Palette', () => {
  assert.ok(manifest.contributes.commands.some((c: { command: string }) => c.command === 'auraR.runInR'));
  assert.ok(manifest.contributes.menus.commandPalette.some((m: { command: string; when: string }) => m.command === 'auraR.runInR' && m.when === 'false'));
});

test("the Run button above an R script goes through the Companion's R-terminal step", () => {
  // vscode-R's own button (r.runSource) sent source(...) into a PowerShell terminal on testbench
  // (2026-10-31, toggle run s9b), so the Companion adds its own, sorted first.
  const run = manifest.contributes.menus['editor/title/run'] ?? [];
  const item = run.find((m: { command: string }) => m.command === 'auraR.runFileInR');
  assert.ok(item, 'editor/title/run has auraR.runFileInR');
  assert.equal(item.when, 'editorLangId == r');
  assert.equal(item.group, 'navigation@0');
  const cmd = manifest.contributes.commands.find((c: { command: string }) => c.command === 'auraR.runFileInR');
  assert.equal(cmd?.title, 'Run this script in R');
  assert.ok(cmd?.icon, 'has an icon for the title bar');
});

test("vscode-R's own run keys are removed in R files, so the Companion's win", () => {
  // rc2 on testbench (2026-10-31, s11b): with both bindings on Ctrl+Enter, vscode-R's ran and sent
  // the line into PowerShell. A "-command" rule removes a keybinding that matches its key and when.
  const VSCODE_R: Array<[string, string, string]> = [
    ['ctrl+enter', 'r.runSelection', "editorTextFocus && editorLangId == 'r'"],
    ['ctrl+enter', 'r.runSelection', "editorTextFocus && editorLangId == 'rmd'"],
    ['alt+enter', 'r.runSelectionRetainCursor', "editorTextFocus && editorLangId == 'r'"],
    ['ctrl+shift+enter', 'r.runCurrentChunk', "editorTextFocus && (editorLangId == 'rmd' || editorLangId == 'r')"],
    ['ctrl+alt+p', 'r.runAboveChunks', "editorTextFocus && (editorLangId == 'rmd' || editorLangId == 'r')"],
    ['shift+ctrl+s', 'r.runSource', "editorTextFocus && editorLangId == 'r'"],
    ['shift+ctrl+enter', 'r.runSourcewithEcho', "editorTextFocus && editorLangId == 'r'"],
    ['ctrl+alt+b', 'r.runFromBeginningToLine', "editorTextFocus && editorLangId == 'r'"],
    ['ctrl+alt+e', 'r.runFromLineToEnd', "editorTextFocus && editorLangId == 'r'"],
  ];
  const kb: Array<{ key: string; command: string; when?: string }> = manifest.contributes.keybindings ?? [];
  for (const [key, cmd, when] of VSCODE_R) {
    assert.ok(kb.some((k) => k.key.toLowerCase() === key && k.command === `-${cmd}` && k.when === when), `remove ${key} ${cmd} [${when}]`);
  }
});

test("macOS: the run keys use vscode-R 3.2.2's mac keys, removed and replaced (Copilot review of #5)", () => {
  // VS Code reads `mac` in place of `key` on macOS. vscode-R 3.2.2 binds Cmd+Enter and the rest
  // there, so a rule with only `key` neither removes nor replaces its binding on a Mac.
  const UPSTREAM: Array<[string, string, string]> = [
    ['r.runSelection', 'cmd+enter', "editorTextFocus && editorLangId == 'r'"],
    ['r.runSelection', 'cmd+enter', "editorTextFocus && editorLangId == 'rmd'"],
    ['r.runSelectionRetainCursor', 'option+enter', "editorTextFocus && editorLangId == 'r'"],
    ['r.runCurrentChunk', 'cmd+shift+enter', "editorTextFocus && (editorLangId == 'rmd' || editorLangId == 'r')"],
    ['r.runAboveChunks', 'cmd+alt+p', "editorTextFocus && (editorLangId == 'rmd' || editorLangId == 'r')"],
    ['r.runSource', 'shift+cmd+s', "editorTextFocus && editorLangId == 'r'"],
    ['r.runSourcewithEcho', 'shift+cmd+enter', "editorTextFocus && editorLangId == 'r'"],
    ['r.runFromBeginningToLine', 'cmd+alt+b', "editorTextFocus && editorLangId == 'r'"],
    ['r.runFromLineToEnd', 'cmd+alt+e', "editorTextFocus && editorLangId == 'r'"],
  ];
  const kb: Array<{ key: string; mac?: string; command: string; args?: unknown; when?: string }> = manifest.contributes.keybindings ?? [];
  const macKey = (k: { key: string; mac?: string }) => (k.mac ?? k.key).toLowerCase();
  for (const [cmd, mac, when] of UPSTREAM) {
    assert.ok(kb.some((k) => k.command === `-${cmd}` && k.when === when && macKey(k) === mac), `mac removal ${mac} ${cmd} [${when}]`);
    assert.ok(kb.some((k) => k.command === 'auraR.runInR' && k.args === cmd && macKey(k) === mac), `mac replacement ${mac} -> ${cmd}`);
  }
  for (const k of kb.filter((x) => x.command === 'auraR.runInR' || x.command.startsWith('-r.'))) {
    const cmd = k.command === 'auraR.runInR' ? k.args : k.command.slice(1);
    assert.ok(UPSTREAM.some(([c, mac]) => c === cmd && mac === macKey(k)), `${k.command} ${String(k.args ?? '')}: mac key ${macKey(k)} is not vscode-R's`);
  }
});
