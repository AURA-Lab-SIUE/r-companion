// The labels a student can see on screen, and the labels the guides, the Field Guide, and the
// video transcripts tell them to click (0.7.5, A3 label-stability guard, #rgui F1). Used by
// test/labels.test.ts and scripts/doc-labels.mjs. No VS Code API, so node loads it directly.

import * as fs from 'fs';
import * as path from 'path';
import { CATALOG, menuItems } from '../src/catalog';
import { panelTree, PanelNode } from '../src/panelModel';

const ROOT = path.join(__dirname, '..', '..');

const flat = (nodes: PanelNode[]): PanelNode[] => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);

/**
 * The string literals a source file holds that read as words on screen (no R code), unescaped.
 * A template literal with ${} gives its fixed words around the name, as parts ("Keep every row of ",
 * ": everything is installed").
 */
function literals(src: string): { whole: string[]; parts: string[] } {
  const whole: string[] = [];
  const parts: string[] = [];
  const code = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  // R code, paths, and regexes are not words on screen
  const isCode = (t: string) => /[A-Za-z0-9_.]\(|[{};<>%=|\\]|\$\{/.test(t) || !/[A-Za-z]{2}/.test(t);
  for (const m of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*?)\1/g)) {
    const text = m[2].replace(/\\(.)/g, '$1');
    if (m[1] === '`' && text.includes('${')) {
      for (const part of text.split(/\$\{[^}]*\}/)) if (part.trim().split(/\s+/).length >= 2 && !isCode(part)) parts.push(part);
    } else if (!isCode(text) && text.trim() === text) whole.push(text);
  }
  return { whole, parts };
}

/**
 * The Companion's named labels: Write R code items and their groups, panel nodes in each course,
 * and AURA commands as the Command Palette lists them ("AURA: <title>") and as the panel does.
 */
export function namedLabels(root = ROOT): Set<string> {
  const out = new Set<string>();
  for (const d of CATALOG) out.add(d.label);
  for (const c of new Set(CATALOG.map((d) => d.category))) out.add(c);
  for (const course of ['mc427', 'mc451', 'mc501'] as const) {
    for (const crossCheck of [false, true]) {
      for (const n of flat(panelTree({ course, items: menuItems(course, true), crossCheck, banners: [] }))) out.add(n.label);
    }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const c of pkg.contributes?.commands ?? []) {
    out.add(c.title);
    if (c.category) out.add(`${c.category}: ${c.title}`);
  }
  for (const s of [...out]) if (!s || !s.trim()) out.delete(s);
  return out;
}

/** The other words the Companion puts on screen: QuickPick items, box titles, buttons, the R (AURA) terminal. */
export function shownLabels(root = ROOT): Set<string> {
  const out = new Set<string>();
  for (const f of sourceFiles(root)) for (const s of literals(fs.readFileSync(f, 'utf8')).whole) out.add(s);
  return out;
}

/** Every label the Companion shows, named or not. */
export function labelUniverse(root = ROOT): Set<string> {
  return new Set([...namedLabels(root), ...shownLabels(root)]);
}

/** The Companion's own source files, without the R code templates. */
function sourceFiles(root: string): string[] {
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'codegen' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []));
  return walk(path.join(root, 'src'));
}

/** The fixed words of labels the Companion builds around a name ("Keep every row of "). */
export function labelPrefixes(root = ROOT): string[] {
  return [...new Set(sourceFiles(root).flatMap((f) => literals(fs.readFileSync(f, "utf8")).parts))];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A label short enough to be an ordinary word counts only when the document bolds it. */
export const shortLabel = (label: string) => label.length < 8 || !/\s/.test(label);

/**
 * The Companion labels a document names. A named label counts verbatim on word edges (a short one
 * only in bold); any other on-screen words count only when a guide bolds them as the thing to click
 * or read, because ordinary phrases ("a number", "the column") are on screen too.
 */
export function labelsIn(text: string, named: Iterable<string>, shown: Iterable<string> = []): string[] {
  const t = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const bold = (l: string) => new RegExp(`\\*\\*${escape(l)}\\*\\*`);
  const found = new Set<string>();
  for (const label of named) {
    if (label.length < 3) continue;
    const re = shortLabel(label) ? bold(label) : new RegExp(`(?<![A-Za-z0-9])${escape(label)}(?![A-Za-z0-9])`);
    if (re.test(t)) found.add(label);
  }
  for (const label of shown) if (label.length >= 3 && /^[A-Z]/.test(label) && bold(label).test(t)) found.add(label);
  return [...found].sort();
}
