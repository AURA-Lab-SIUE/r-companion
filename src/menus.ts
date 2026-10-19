// R2/R3/R4 menus: the quick-pick wizards and the reliability grid (workstream E, #rgui).
//
// Native quick picks first, one webview only (the reliability grid): scope memo section 3. Every
// task writes a commented tidyverse block from the codegen templates, inserts it at the cursor (in
// a .R file or a .qmd chunk), and offers to run it through the R adapter. The column picker reads
// the golden column probe's JSON, never console text.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CourseId } from './profiles';
import { generate, hasTask, GenProfile, GenParams, GenOptions, TASK_RELEASE, Release } from './codegen';
import { parseColumnProbe, ColumnProbe, ProbeColumn, categoryColumns, pickerHint } from './columnProbe';
import { prepareInsert, isQuartoFile, isInsideRChunk } from './insert';
import { buildGridHtml, gridCsv, GridConfig, DEFAULT_GRID, GridResult } from './grid';

/** What the menus need from the host extension. */
export interface MenuDeps {
  output: vscode.OutputChannel;
  currentCourse: () => CourseId | undefined;
  pickCourse: (alwaysAsk: boolean) => Promise<CourseId | undefined>;
  /** Run a short-lived Rscript (for the column probe). Resolves with stdout/stderr/exit. */
  runRscript: (rscript: string, args: string[], timeoutMs?: number) => Promise<{ code: number | null; stdout: string; stderr: string }>;
  /** The Rscript path the extension discovered, or undefined. */
  rscriptPath: () => string | undefined;
  /** Run R the student can see (the adapter's runCode). */
  runInSession: (code: string) => Promise<void>;
  requireTrust: (what: string, rerun: () => unknown) => Promise<boolean>;
  /** Absolute path to a bundled resource (resources/<name>). */
  resourcePath: (name: string) => string;
  /** The extension's global storage dir (for the generated CSV and probe temp files). */
  storageDir: string;
  /** auraR.previewReleases: unlock R3 and R4 before their release dates. */
  previewReleases: () => boolean;
  /** auraR.reliabilityPlainCalls: write plain irr calls instead of the v2v wrapper (q-0044). */
  plainCalls: () => boolean;
}

interface TaskDef {
  task: string;
  label: string;
  category: string;
  /** A column-choosing task: probe the data and pick columns. */
  columns?: 'one' | 'many';
  /** A file-writing task: ask for the output name. */
  outFile?: boolean;
  alternative?: boolean;
}

// The menu catalog. hasTask(profile, task) decides which of these a course actually offers.
const CATALOG: TaskDef[] = [
  { task: 'import-csv', label: 'Import a CSV file', category: 'R2 Data' },
  { task: 'import-course-dataset', label: 'Load the course Twitch corpus', category: 'R2 Data' },
  { task: 'import-rds', label: 'Load your saved analysis (RDS)', category: 'R2 Data' },
  { task: 'filter', label: 'Keep some rows (filter)', category: 'R2 Data', columns: 'one' },
  { task: 'select', label: 'Keep some columns (select)', category: 'R2 Data', columns: 'many' },
  { task: 'mutate', label: 'Add a column (mutate)', category: 'R2 Data' },
  { task: 'count', label: 'Count rows per group (count)', category: 'R2 Data', columns: 'one' },
  { task: 'clean-dates', label: 'Turn the date column into a time (clean_dates)', category: 'R2 Data' },
  { task: 'convert-timestamp', label: 'Turn the date column into a time (plain, no v2v)', category: 'R2 Data', alternative: true },
  { task: 'join-chat-streams', label: 'Match each message to its stream (join_chat_streams)', category: 'R2 Data' },
  { task: 'channel-lookup', label: 'Label each channel by its top category', category: 'R2 Data' },
  { task: 'join-lookup', label: 'Join the channel labels onto the messages', category: 'R2 Data' },
  { task: 'label-from-snapshot', label: 'Label each message per moment (alternative)', category: 'R2 Data', alternative: true },
  { task: 'export-csv', label: 'Save a table as a CSV file', category: 'R2 Data', outFile: true },
  { task: 'export-rds', label: 'Save a table as an RDS file', category: 'R2 Data', outFile: true },
  { task: 'reliability', label: 'Reliability grid and statistic', category: 'R2 Data' },
  { task: 'frequency', label: 'Frequency table', category: 'R3 Describe', columns: 'one' },
  { task: 'crosstab', label: 'Crosstab with proportions', category: 'R3 Describe' },
  { task: 'grouped-summary', label: 'Summary by group', category: 'R3 Describe' },
  { task: 'bar', label: 'Bar chart', category: 'R3 Describe' },
  { task: 'histogram', label: 'Histogram', category: 'R3 Describe' },
  { task: 'boxplot', label: 'Boxplot', category: 'R3 Describe' },
  { task: 'settings-block', label: 'Settings block (name the test variables)', category: 'R4 Test' },
  { task: 't-test', label: 'Welch t-test with Cohen\'s d', category: 'R4 Test' },
  { task: 't-test-missing', label: 'Welch t-test, dropping missing values', category: 'R4 Test' },
  { task: 'chi-square', label: 'Chi-square test with Cramer\'s V', category: 'R4 Test' },
  { task: 'anova', label: 'One-way ANOVA with eta squared', category: 'R4 Test' },
  { task: 'regression', label: 'Linear regression', category: 'R4 Test' },
  { task: 'correlation', label: 'Correlation', category: 'R4 Test' },
];

function profileOf(course: CourseId): GenProfile {
  return course;
}

function releaseEnabled(task: string, preview: boolean): boolean {
  const rel: Release = TASK_RELEASE[task];
  return rel === 'R2' || preview;
}

export function registerMenus(context: vscode.ExtensionContext, deps: MenuDeps): void {
  const reg = (id: string, fn: (...a: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  reg('auraR.writeCode', () => writeCodeCommand(deps));
  reg('auraR.openReliabilityGrid', () => openReliabilityGrid(context, deps));
}

// ---------------- the write-code wizard ----------------

async function writeCodeCommand(deps: MenuDeps): Promise<void> {
  const course = deps.currentCourse() ?? (await deps.pickCourse(false));
  if (!course) return;
  const profile = profileOf(course);
  const preview = deps.previewReleases();

  const offered = CATALOG.filter((t) => hasTask(profile, t.task) && releaseEnabled(t.task, preview));
  const picks: (vscode.QuickPickItem & { def?: TaskDef })[] = [];
  let category = '';
  for (const t of offered) {
    if (t.category !== category) {
      category = t.category;
      picks.push({ label: category, kind: vscode.QuickPickItemKind.Separator });
    }
    picks.push({ label: t.label, description: t.alternative ? 'alternative' : undefined, def: t });
  }
  const chosen = await vscode.window.showQuickPick(picks, {
    title: `Write R code (${course.toUpperCase()})`,
    placeHolder: preview ? 'Pick a task' : 'Pick a task. R3 and R4 unlock near their release dates.',
    matchOnDescription: true,
  });
  const def = chosen?.def;
  if (!def) return;

  // The reliability task opens the grid webview instead of writing a block directly.
  if (def.task === 'reliability') return vscode.commands.executeCommand('auraR.openReliabilityGrid');

  const params: GenParams = {};
  try {
    if (def.outFile) {
      const name = await vscode.window.showInputBox({ title: def.label, prompt: 'File name to save', value: defaultOutFile(profile, def.task) });
      if (name) params.file = name;
    }
    if (def.columns) await collectColumns(deps, course, def, params);
  } catch (e: any) {
    deps.output.appendLine(`Column pick skipped: ${e?.message ?? e}. Using the course defaults.`);
  }

  const opts: GenOptions = { plainCalls: deps.plainCalls() };
  const code = generate(profile, def.task, params, opts);
  await insertAndMaybeRun(deps, code, def.label);
}

function defaultOutFile(profile: GenProfile, task: string): string {
  if (task === 'export-csv') return profile === 'mc427' ? 'next-posts.csv' : 'data/gaming-messages.csv';
  return profile === 'mc427' ? 'practice-tweets.RDS' : 'data/twitch_analysis.RDS';
}

// Probe a data source the student points at, then let them choose the column(s). Any failure
// throws so the caller falls back to the course defaults.
async function collectColumns(deps: MenuDeps, course: CourseId, def: TaskDef, params: GenParams): Promise<void> {
  const useDefaults = await vscode.window.showQuickPick(
    [
      { label: 'Use the course default columns', pick: 'default' as const },
      { label: 'Choose columns from a data file', pick: 'choose' as const },
    ],
    { title: def.label, placeHolder: 'The default matches the course pages exactly.' },
  );
  if (!useDefaults || useDefaults.pick === 'default') return;

  const file = await vscode.window.showOpenDialog({
    title: 'Pick the data file to read its columns',
    canSelectMany: false,
    filters: { Data: ['csv', 'CSV', 'rds', 'RDS'] },
  });
  if (!file || file.length === 0) return;
  const probe = await runColumnProbe(deps, file[0].fsPath);

  if (def.columns === 'one') {
    const cols = categoryColumns(probe).length ? categoryColumns(probe) : probe.columns;
    const col = await pickColumn(cols, probe, def.label);
    if (col) {
      params.column = col.name;
      if ((def.task === 'filter') && col.values && col.values.length) {
        const v = await vscode.window.showQuickPick(col.values, { title: `Keep rows where ${col.name} is` });
        if (v) params.value = v;
      }
    }
  } else {
    const items = probe.columns.map((c) => ({ label: c.name, description: c.type, picked: false, col: c }));
    const chosen = await vscode.window.showQuickPick(items, { title: def.label, canPickMany: true, placeHolder: 'Pick the columns to keep' });
    if (chosen && chosen.length) params.columns = chosen.map((c) => c.col.name);
  }
}

async function pickColumn(cols: ProbeColumn[], probe: ColumnProbe, title: string): Promise<ProbeColumn | undefined> {
  const items = cols.map((c) => ({ label: c.name, description: c.type, detail: pickerHint(c, probe.rows), col: c }));
  const chosen = await vscode.window.showQuickPick(items, { title, placeHolder: 'Pick a column', matchOnDetail: true });
  return chosen?.col;
}

/** Substitute the probe tokens, run Rscript, and parse the JSON it wrote (never console text). */
async function runColumnProbe(deps: MenuDeps, dataPath: string): Promise<ColumnProbe> {
  const rscript = deps.rscriptPath();
  if (!rscript) throw new Error('R was not found. Run Check my setup first.');
  const isRds = /\.rds$/i.test(dataPath);
  const dataExpr = isRds
    ? `readRDS(${JSON.stringify(dataPath)})`
    : `readr::read_csv(${JSON.stringify(dataPath)}, show_col_types = FALSE)`;
  fs.mkdirSync(deps.storageDir, { recursive: true });
  const outPath = path.join(deps.storageDir, `probe-${Date.now()}.json`);
  const tpl = fs.readFileSync(deps.resourcePath('column-probe.R'), 'utf8');
  const script = tpl.replace('__DATA__', dataExpr).replace('__OUT__', outPath.replace(/\\/g, '/'));
  const scriptPath = path.join(deps.storageDir, `probe-${Date.now()}.R`);
  fs.writeFileSync(scriptPath, script);
  const res = await deps.runRscript(rscript, [scriptPath], 60000);
  if (!fs.existsSync(outPath)) {
    deps.output.appendLine(res.stdout);
    deps.output.appendLine(res.stderr);
    throw new Error('The column probe did not write its result.');
  }
  const probe = parseColumnProbe(fs.readFileSync(outPath, 'utf8'));
  fs.rmSync(outPath, { force: true });
  fs.rmSync(scriptPath, { force: true });
  return probe;
}

// Insert the generated code at the cursor, then offer to run it.
async function insertAndMaybeRun(deps: MenuDeps, code: string, label: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    const doc = await vscode.workspace.openTextDocument({ language: 'r', content: code });
    await vscode.window.showTextDocument(doc);
  } else {
    const doc = editor.document;
    const quarto = isQuartoFile(doc.fileName) || doc.languageId === 'quarto' || doc.languageId === 'rmd';
    const linesAbove = doc.getText(new vscode.Range(0, 0, editor.selection.active.line, editor.selection.active.character)).split(/\r?\n/);
    const plan = prepareInsert(code, quarto, quarto ? isInsideRChunk(linesAbove) : true);
    await editor.edit((b) => b.insert(editor.selection.active, plan.text));
    if (plan.wrappedInChunk) deps.output.appendLine('Wrapped the code in a new ```{r} chunk.');
  }
  deps.output.appendLine(`Inserted: ${label}.`);
  const run = await vscode.window.showInformationMessage(`Inserted the ${label} code. Run it now?`, 'Run it');
  if (run) {
    if (!(await deps.requireTrust('running R code', () => deps.runInSession(code)))) return;
    await deps.runInSession(code);
  }
}

// ---------------- the reliability grid webview ----------------

async function openReliabilityGrid(context: vscode.ExtensionContext, deps: MenuDeps): Promise<void> {
  const course = deps.currentCourse() ?? (await deps.pickCourse(false));
  if (!course) return;
  if (course === 'mc427') {
    vscode.window.showInformationMessage('The reliability grid is for MC 451 and MC 501. MC 427 does not use it.');
    return;
  }
  const panel = vscode.window.createWebviewPanel('auraReliabilityGrid', 'Reliability grid', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  const cfg: GridConfig = { ...DEFAULT_GRID };
  const nonce = makeNonce();
  panel.webview.html = buildGridHtml(cfg, { cspSource: panel.webview.cspSource, nonce });

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type !== 'generate') return;
    const result: GridResult = {
      rows: msg.rows,
      method: msg.method === 'alpha' ? 'alpha' : 'kappa',
      pass_1_date: String(msg.pass_1_date ?? ''),
      pass_2_date: String(msg.pass_2_date ?? ''),
    };
    await saveGridAndGenerate(deps, course as CourseId, result, panel);
  }, undefined, context.subscriptions);
}

async function saveGridAndGenerate(deps: MenuDeps, course: CourseId, result: GridResult, panel: vscode.WebviewPanel): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const csvRel = 'data/reliability-pilot.csv';
  let target: vscode.Uri;
  if (folder) {
    target = vscode.Uri.joinPath(folder.uri, 'data', 'reliability-pilot.csv');
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, 'data'));
  } else {
    target = vscode.Uri.file(path.join(deps.storageDir, 'reliability-pilot.csv'));
    fs.mkdirSync(deps.storageDir, { recursive: true });
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(gridCsv(result), 'utf8'));
  deps.output.appendLine(`Saved ${result.rows.filter((r) => r.pass_1 && r.pass_2).length} coded items to ${target.fsPath}`);

  // The generated block loads the saved pilot CSV into `pilot`, then runs the statistic. The golden
  // reliability code shows both Cohen's kappa and Krippendorff's alpha, so the student can compare;
  // the grid's statistic choice is recorded in the write-up. plainCalls (q-0044) writes the irr
  // calls instead of the v2v wrapper.
  const importBlock = generate(profileOf(course), 'import-csv', { file: csvRel });
  const relBlock = generate(profileOf(course), 'reliability', {}, { plainCalls: deps.plainCalls() });
  const code = importBlock + '\n' + relBlock;
  panel.dispose();
  await insertAndMaybeRun(deps, code, 'reliability');
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
