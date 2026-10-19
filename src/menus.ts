// R2/R3/R4 menus: the quick-pick wizards and the reliability grid (workstream E, #rgui).
//
// Native quick picks first, one webview only (the reliability grid): scope memo section 3. Every
// task writes a commented tidyverse block from the codegen templates, inserts it at the cursor (in
// a .R file or a .qmd chunk), and offers to run it through the R adapter. The column picker reads
// the golden column probe's JSON, never console text.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CourseId } from './profiles';
import { generate, hasTask, GenProfile, GenParams, GenOptions, APA_TESTS, ApaTest, apaTask } from './codegen';
import { TEST_LABEL } from './testChoice';
import { parseColumnProbe, ColumnProbe, ProbeColumn, categoryColumns, pickerHint } from './columnProbe';
import { prepareInsert, isQuartoFile, isInsideRChunk, FIG_ALT_OPTION } from './insert';
import { buildGridHtml, gridCsv, GridConfig, DEFAULT_GRID, GridResult } from './grid';
import { assignedNames, tableChoices, TableChoice, TABLE_TASKS, MAKES } from './tables';

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
  /** auraR.apaCheck: offer the APA numbers block in the Test menu (owner decision U4). */
  apaCheck: () => boolean;
  /** auraR.mc427TestMenu: in MC 427 the Test menu is a cross-check on Copilot's code (U2). */
  mc427TestMenu: () => 'cross-check' | 'writer';
  /** auraR.plainCalls: the plain calls instead of the v2v wrappers (q-20261018-0044 = A). */
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
  { task: 'check-test-choice', label: 'Check my test choice', category: 'R4 Test' },
  { task: 'apa-check', label: 'APA numbers to check your sentence', category: 'R4 Test' },
];


// The R4 tasks MC 427 offers as a check on Copilot's code under U2 ("cross-check")
const R4_TEST_TASKS = new Set(['t-test', 't-test-missing', 'chi-square', 'anova', 'regression', 'correlation', 'apa-check']);

function profileOf(course: CourseId): GenProfile {
  return course;
}

function offers(profile: GenProfile, task: string, apaCheck: boolean): boolean {
  if (task === 'check-test-choice') return true;
  if (task === 'apa-check') return apaCheck && hasTask(profile, apaTask('t-test'));
  return hasTask(profile, task);
}

/** The Write R code items a course offers, in menu order (the integration suites pick by index). */
export function menuTasks(profile: GenProfile, apaCheck: boolean): string[] {
  return CATALOG.filter((t) => offers(profile, t.task, apaCheck)).map((t) => t.task);
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
  const crossCheck = course === 'mc427' && deps.mc427TestMenu() === 'cross-check';

  const offered = CATALOG.filter((t) => offers(profile, t.task, deps.apaCheck()));
  const picks: (vscode.QuickPickItem & { def?: TaskDef })[] = [];
  let category = '';
  for (const t of offered) {
    if (t.category !== category) {
      category = t.category;
      const label = crossCheck && category === 'R4 Test' ? "R4 Test: a check on Copilot's code" : category;
      picks.push({ label, kind: vscode.QuickPickItemKind.Separator });
    }
    picks.push({ label: t.label, description: t.alternative ? 'alternative' : undefined, def: t });
  }
  const chosen = await vscode.window.showQuickPick(picks, {
    title: `Write R code (${course.toUpperCase()})`,
    placeHolder: 'Pick a task',
    matchOnDescription: true,
  });
  const def = chosen?.def;
  if (!def) return;

  // These open a webview, a command, or a second pick instead of writing one block directly
  if (def.task === 'reliability') return vscode.commands.executeCommand('auraR.openReliabilityGrid');
  if (def.task === 'check-test-choice') return vscode.commands.executeCommand('auraR.checkTestChoice');
  let task = def.task;
  if (task === 'apa-check') {
    const test = await pickApaTest(profile);
    if (!test) return;
    task = apaTask(test);
  }

  const params: GenParams = {};
  if (course !== 'mc427' && TABLE_TASKS.has(def.task)) {
    // MC 451 and MC 501: count, filter, and select read a table the script already has (tables.ts)
    if (!(await collectTableAndColumns(deps, def, params))) return;
  } else {
    try {
      if (def.outFile) {
        const name = await vscode.window.showInputBox({ title: def.label, prompt: 'File name to save', value: defaultOutFile(profile, def.task) });
        if (name) params.file = name;
      }
      if (def.columns) await collectColumns(deps, def, params);
    } catch (e: any) {
      deps.output.appendLine(`Column pick skipped: ${e?.message ?? e}. Using the course defaults.`);
    }
  }

  const opts: GenOptions = { plainCalls: deps.plainCalls() };
  const code = generate(profile, task, params, opts);
  // U2 (coordinator default, auraR.mc427TestMenu): in MC 427 Module 5, Copilot writes the graded
  // analysis and the Test menu checks it. Shown with the Run prompt, not after it, so it appears
  // even when the student never answers that prompt.
  const note = crossCheck && R4_TEST_TASKS.has(def.task)
    ? 'Module 5: Copilot writes your analysis code. Use this block to check it, and log any difference as a Copilot error you caught.'
    : undefined;
  await insertAndMaybeRun(deps, code, def.label, task, note);
}

/** Which test the APA numbers block is for. */
async function pickApaTest(profile: GenProfile): Promise<ApaTest | undefined> {
  const items = APA_TESTS.filter((t) => hasTask(profile, apaTask(t))).map((t) => ({ label: TEST_LABEL[t], test: t }));
  const chosen = await vscode.window.showQuickPick(items, {
    title: 'APA numbers to check your sentence',
    placeHolder: 'Which test did you run? The block prints its numbers in APA form; the sentence stays yours.',
  });
  return chosen?.test;
}

// The tables a menu block made when the student ran it in this window (MAKES in tables.ts)
const ranTables = new Set<string>();

// Pick the table, then its column. The tables offered are the ones the script assigns above the
// cursor or a run block made, so the code never reads a table that does not exist yet. Returns
// false when nothing should be written.
async function collectTableAndColumns(deps: MenuDeps, def: TaskDef, params: GenParams): Promise<boolean> {
  const editor = vscode.window.activeTextEditor;
  const above = editor ? editor.document.getText(new vscode.Range(new vscode.Position(0, 0), editor.selection.active)) : '';
  const has = new Set([...assignedNames(above), ...ranTables]);
  const folder = vscode.workspace.workspaceFolders?.[0];
  const rds = folder ? path.join(folder.uri.fsPath, 'data', 'twitch_analysis.RDS') : undefined;
  const choices = tableChoices(def.task, has, rds && fs.existsSync(rds) ? rds.replace(/\\/g, '/') : undefined);

  let table = choices[0];
  if (choices.length > 1) {
    const picked = await vscode.window.showQuickPick(
      choices.map((c, i) => ({ label: c.name, description: i === 0 ? 'default' : undefined, detail: c.detail, c })),
      { title: def.label, placeHolder: 'Which table? These are the tables your script has made so far.' },
    );
    if (!picked) return false;
    table = picked.c;
  }
  params.data = table.name;

  if (table.templateDefault || table.defaultColumn !== undefined) {
    if (table.defaultColumn) params.column = table.defaultColumn;
    try {
      await collectColumns(deps, def, params, table);
    } catch (e: any) {
      deps.output.appendLine(`Column pick skipped: ${e?.message ?? e}. Using the course defaults.`);
    }
    return true;
  }

  // No course default for this table: the column comes from the probe, or nothing is written
  try {
    if (!table.probe) throw new Error(`${table.name} lives only in your R session`);
    await pickFromProbe(await runColumnProbe(deps, table.probe), def, params);
  } catch (e: any) {
    deps.output.appendLine(`Column pick for ${table.name} failed: ${e?.message ?? e}.`);
  }
  if (params.column === undefined && params.columns === undefined) {
    vscode.window.showWarningMessage(`${def.label}: no column was chosen for ${table.name}, so nothing was written.`);
    return false;
  }
  return true;
}

function defaultOutFile(profile: GenProfile, task: string): string {
  if (task === 'export-csv') return profile === 'mc427' ? 'next-posts.csv' : 'data/gaming-messages.csv';
  return profile === 'mc427' ? 'practice-tweets.RDS' : 'data/twitch_analysis.RDS';
}

// Probe a data source, then let the student choose the column(s). The source is the table's own
// probe expression when it has one (the course corpus, the saved analysis file), or a data file
// the student points at. Any failure throws so the caller falls back to the course defaults.
async function collectColumns(deps: MenuDeps, def: TaskDef, params: GenParams, table?: TableChoice): Promise<void> {
  const what = def.columns === 'many' ? 'columns' : 'the column';
  const useDefaults = await vscode.window.showQuickPick(
    [
      { label: 'Use the course default columns', description: params.column, pick: 'default' as const },
      { label: table?.probe ? `Choose ${what} from ${table.name}` : 'Choose columns from a data file', pick: 'choose' as const },
    ],
    { title: def.label, placeHolder: 'The default matches the course pages exactly.' },
  );
  if (!useDefaults || useDefaults.pick === 'default') return;

  let source = table?.probe;
  if (!source) {
    const file = await vscode.window.showOpenDialog({
      title: 'Pick the data file to read its columns',
      canSelectMany: false,
      filters: { Data: ['csv', 'CSV', 'rds', 'RDS'] },
    });
    if (!file || file.length === 0) return;
    source = dataExprFor(file[0].fsPath);
  }
  await pickFromProbe(await runColumnProbe(deps, source), def, params);
}

// Let the student choose from the probe: one grouping column (and, for filter, its value), or
// several columns to keep.
async function pickFromProbe(probe: ColumnProbe, def: TaskDef, params: GenParams): Promise<void> {
  if (def.columns === 'one') {
    const cols = categoryColumns(probe).length ? categoryColumns(probe) : probe.columns;
    const col = await pickColumn(cols, probe, def.label);
    if (!col) return;
    params.column = col.name;
    if (def.task !== 'filter') return;
    // TRUE, FALSE, and numbers are written without quotation marks
    params.rawValue = col.type === 'lgl' || col.type === 'dbl' || col.type === 'int';
    const v = col.values && col.values.length
      ? await vscode.window.showQuickPick(col.values, { title: `Keep rows where ${col.name} is` })
      : await vscode.window.showInputBox({ title: `Keep rows where ${col.name} is`, prompt: `Type the value to keep (${col.n_distinct} different values in ${col.name})` });
    if (v) params.value = v;
    else params.column = undefined;
  } else {
    const items = probe.columns.map((c) => ({ label: c.name, description: c.type, picked: false, col: c }));
    const chosen = await vscode.window.showQuickPick(items, { title: def.label, canPickMany: true, placeHolder: 'Pick the columns to keep' });
    if (chosen && chosen.length) params.columns = chosen.map((c) => c.col.name);
  }
}

/** The R expression the column probe reads a data file with. */
function dataExprFor(dataPath: string): string {
  return /\.rds$/i.test(dataPath)
    ? `readRDS(${JSON.stringify(dataPath)})`
    : `readr::read_csv(${JSON.stringify(dataPath)}, show_col_types = FALSE)`;
}

async function pickColumn(cols: ProbeColumn[], probe: ColumnProbe, title: string): Promise<ProbeColumn | undefined> {
  const items = cols.map((c) => ({ label: c.name, description: c.type, detail: pickerHint(c, probe.rows), col: c }));
  const chosen = await vscode.window.showQuickPick(items, { title, placeHolder: 'Pick a column', matchOnDetail: true });
  return chosen?.col;
}

/** Substitute the probe tokens, run Rscript, and parse the JSON it wrote (never console text). */
async function runColumnProbe(deps: MenuDeps, dataExpr: string): Promise<ColumnProbe> {
  const rscript = deps.rscriptPath();
  if (!rscript) throw new Error('R was not found. Run Check my setup first.');
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

// The chart tasks: each writes alt text, and gets a fig-alt chunk option in Quarto
const CHART_TASKS = new Set(['bar', 'histogram', 'boxplot']);

// Insert the generated code at the cursor, then offer to run it.
async function insertAndMaybeRun(deps: MenuDeps, code: string, label: string, task?: string, note?: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    const doc = await vscode.workspace.openTextDocument({ language: 'r', content: code });
    await vscode.window.showTextDocument(doc);
  } else {
    const doc = editor.document;
    const quarto = isQuartoFile(doc.fileName) || doc.languageId === 'quarto' || doc.languageId === 'rmd';
    const linesAbove = doc.getText(new vscode.Range(0, 0, editor.selection.active.line, editor.selection.active.character)).split(/\r?\n/);
    const chart = CHART_TASKS.has(task ?? '');
    const plan = prepareInsert(code, quarto, quarto ? isInsideRChunk(linesAbove) : true, chart ? [FIG_ALT_OPTION] : []);
    await editor.edit((b) => b.insert(editor.selection.active, plan.text));
    if (plan.wrappedInChunk) deps.output.appendLine('Wrapped the code in a new ```{r} chunk.');
    // Inside a chunk the student already has, the option cannot go in for them: options sit at its top
    if (chart && quarto && !plan.wrappedInChunk) {
      void vscode.window.showInformationMessage(
        'Quarto reads alt text from a #| fig-alt: line at the top of the chunk, not from labs(). Add one with the same sentence.',
      );
    }
  }
  deps.output.appendLine(`Inserted: ${label}.`);
  if (note) void vscode.window.showInformationMessage(note);
  const run = await vscode.window.showInformationMessage(`Inserted the ${label} code. Run it now?`, 'Run it');
  if (run) {
    const runIt = async () => {
      await deps.runInSession(code);
      for (const name of MAKES[task ?? ''] ?? []) ranTables.add(name);
    };
    if (!(await deps.requireTrust('running R code', runIt))) return;
    await runIt();
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
  // The script the student was in: the panel takes focus, so without this the code would land in
  // a new Untitled file instead (seen in the R2 card run, 2026-10-19)
  const script = vscode.window.activeTextEditor;
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
    await saveGridAndGenerate(deps, course as CourseId, result, panel, script);
  }, undefined, context.subscriptions);
}

async function saveGridAndGenerate(
  deps: MenuDeps,
  course: CourseId,
  result: GridResult,
  panel: vscode.WebviewPanel,
  script?: vscode.TextEditor,
): Promise<void> {
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
  // the grid's statistic choice is recorded in the write-up. plainCalls (q-20261018-0044 = A, the
  // default) writes the irr calls, with the v2v wrapper last as a check.
  const importBlock = generate(profileOf(course), 'import-csv', { file: csvRel });
  const relBlock = generate(profileOf(course), 'reliability', {}, { plainCalls: deps.plainCalls() });
  const code = importBlock + '\n' + relBlock;
  panel.dispose();
  // Back to that script, with its cursor where the student left it
  if (script && !script.document.isClosed) {
    await vscode.window.showTextDocument(script.document, { viewColumn: script.viewColumn, selection: script.selection });
  }
  await insertAndMaybeRun(deps, code, 'reliability');
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
