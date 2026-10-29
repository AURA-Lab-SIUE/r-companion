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
import { generate, hasTask, GenProfile, GenParams, APA_TESTS, ApaTest, apaTask } from './codegen';
import { TEST_LABEL } from './testChoice';
import { parseColumnProbe, ColumnProbe, ProbeColumn, categoryColumns, pickerHint, fillProbe } from './columnProbe';
import { prepareInsert, isQuartoFile, isInsideRChunk, FIG_ALT_OPTION, wrapChunk } from './insert';
import { CHART_TASKS, watchSavedChart } from './chartWatch';
import { buildGridHtml, gridCsv, GridConfig, DEFAULT_GRID, GridResult } from './grid';
import { CATALOG, TaskDef, R4_TEST_TASKS, profileOf, offers } from './catalog';
import { assignedNames, tableChoices, TableChoice, TABLE_TASKS, MAKES, tableSources, sharedColumns, repeatWarning } from './tables';
import { STEPS_FILE, appendBlock, runnableScript, runStepsCode, RUN_STEPS_NOTICE } from './steps';
import { passPairs, reliabilityForPair, gridFileName } from './reliabilityCode';
import { dataFileKind, tableNameFromFile, tableNameProblem, scriptPath, OUTSIDE_NOTICE, probeExpr, sheetListExpr, peekSummary, typeWord, namesNeedCleaning } from './importFile';

export { menuTasks, menuItems } from './catalog';

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
}

// The last text editor the student worked in. A chart tab, the data viewer, or the error
// explanation takes focus and leaves no active text editor, and without this the next block would
// land in a new Untitled file instead of the student's script (seen in the 0.5.1 video run, 2026-10-19).
let lastTextDoc: { doc: vscode.TextDocument; selection: vscode.Selection; column?: vscode.ViewColumn } | undefined;

// The last R or Quarto script the student worked in. Opening a CSV for the data viewer makes the
// CSV the last text editor and can cover the script's tab, and without this the viewer's block
// went to steps.R while the student's other blocks were in analysis.qmd (r3r4 suite, 2026-10-28).
let lastScriptDoc: vscode.TextDocument | undefined;

function rememberEditor(e: vscode.TextEditor | undefined): void {
  if (e && (e.document.uri.scheme === 'file' || e.document.uri.scheme === 'untitled')) {
    lastTextDoc = { doc: e.document, selection: e.selection, column: e.viewColumn };
    if (e.document.uri.scheme === 'file' && runnableScript(e.document.fileName)) lastScriptDoc = e.document;
  }
}

// A script the student closed is not one to write into. VS Code keeps a closed file's document in
// memory for a while (isClosed stays false), so a script counts as open while it has a tab.
function stillOpen(doc: vscode.TextDocument): boolean {
  if (doc.isClosed) return false;
  const uri = doc.uri.toString();
  return vscode.window.tabGroups.all.some((g) =>
    g.tabs.some((t) => t.input instanceof vscode.TabInputText && t.input.uri.toString() === uri),
  );
}

// The editor to write into: the active one, or else the script the student last worked in, brought
// back to the front with its cursor where it was.
async function scriptEditor(): Promise<vscode.TextEditor | undefined> {
  const active = vscode.window.activeTextEditor;
  if (active) return active;
  if (!lastTextDoc || !stillOpen(lastTextDoc.doc)) return undefined;
  const editor = await vscode.window.showTextDocument(lastTextDoc.doc, {
    viewColumn: lastTextDoc.column,
    selection: lastTextDoc.selection,
    preserveFocus: false,
    preview: false,
  });
  return editor;
}

export function registerMenus(context: vscode.ExtensionContext, deps: MenuDeps): void {
  rememberEditor(vscode.window.activeTextEditor);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(rememberEditor),
    vscode.window.onDidChangeTextEditorSelection((e) => rememberEditor(e.textEditor)),
  );
  const reg = (id: string, fn: (...a: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  // A task (from the AURA panel) skips the first pick; a tree item or no argument shows the menu
  reg('auraR.writeCode', (task?: unknown) => writeCodeCommand(deps, typeof task === 'string' ? task : undefined));
  reg('auraR.importDataFile', async (preset?: ImportPreset) => {
    const course = deps.currentCourse() ?? (await deps.pickCourse(false));
    if (course) await importDataFile(deps, profileOf(course), 'Import a data file (CSV or Excel)', preset);
  });
  reg('auraR.openReliabilityGrid', () => openReliabilityGrid(context, deps));
  reg('auraR.openSteps', () => openSteps());
  reg('auraR.runSteps', () => runSteps(context, deps));
  reg('auraR.goToLine', (line: number) => goToLine(line));
}

// ---------------- Your steps (0.5.3) ----------------

/** steps.R in the course folder, or undefined with no folder open. */
function stepsFile(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? path.join(folder.uri.fsPath, STEPS_FILE) : undefined;
}

/** The script that holds the student's steps: the one they work in, else steps.R if it exists. */
export function stepsScript(): vscode.TextDocument | string | undefined {
  const active = vscode.window.activeTextEditor?.document;
  if (active && active.uri.scheme === 'file' && runnableScript(active.fileName)) return active;
  if (lastTextDoc && stillOpen(lastTextDoc.doc) && lastTextDoc.doc.uri.scheme === 'file' && runnableScript(lastTextDoc.doc.fileName)) {
    return lastTextDoc.doc;
  }
  if (lastScriptDoc && stillOpen(lastScriptDoc)) return lastScriptDoc;
  const steps = stepsFile();
  return steps && fs.existsSync(steps) ? steps : undefined;
}

/**
 * Add a block to the END of the student's steps script (the script they work in, else steps.R in
 * the course folder, made if needed), unless the script already holds `marker`. For actions that
 * happen outside a script, such as coding in the data viewer, so they still leave R code behind
 * (code parity, 2026-10-28). Returns the file and whether the block was already there.
 */
export async function appendToSteps(code: string, marker: string): Promise<{ file: string; already: boolean } | undefined> {
  const s = stepsScript();
  // Opening a CSV for the viewer makes it the last editor, so a script still showing beside it is
  // the one the student works in (found by the r3r4 suite, 2026-10-28: the block went to a new steps.R)
  const shown = vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'file' && runnableScript(e.document.fileName));
  if ((!s || typeof s === 'string') && shown) return appendToDoc(shown.document, code, marker);
  if (!s || typeof s === 'string') {
    const file = typeof s === 'string' ? s : stepsFile();
    if (!file) return undefined;
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (before.includes(marker)) return { file, already: true };
    // An open copy of the file is edited through VS Code, so an unsaved change there is kept
    const open = vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'file' && path.resolve(d.fileName) === path.resolve(file));
    if (!open) {
      fs.writeFileSync(file, appendBlock(before, code));
      return { file, already: false };
    }
    return appendToDoc(open, code, marker);
  }
  return appendToDoc(s, code, marker);
}

async function appendToDoc(doc: vscode.TextDocument, code: string, marker: string): Promise<{ file: string; already: boolean }> {
  const text = doc.getText();
  if (text.includes(marker)) return { file: doc.fileName, already: true };
  const quarto = isQuartoFile(doc.fileName) || doc.languageId === 'quarto' || doc.languageId === 'rmd';
  const gap = text === '' ? '' : text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  const insert = gap + (quarto ? wrapChunk(code) : code.replace(/\n*$/, '\n'));
  const edit = new vscode.WorkspaceEdit();
  edit.insert(doc.uri, doc.positionAt(text.length), insert);
  await vscode.workspace.applyEdit(edit);
  return { file: doc.fileName, already: false };
}

const NO_STEPS =
  'You have no steps yet. Write R code puts each block into the script you have open, or into steps.R in your course folder when no script is open.';

async function openSteps(): Promise<void> {
  const s = stepsScript();
  if (!s) {
    vscode.window.showInformationMessage(NO_STEPS);
    return;
  }
  await vscode.window.showTextDocument(typeof s === 'string' ? await vscode.workspace.openTextDocument(s) : s, { preview: false });
}

async function runSteps(context: vscode.ExtensionContext, deps: MenuDeps): Promise<void> {
  const s = stepsScript();
  if (!s) {
    vscode.window.showInformationMessage(NO_STEPS);
    return;
  }
  const doc = typeof s === 'string' ? await vscode.workspace.openTextDocument(s) : s;
  // source() reads the file on disk, so unsaved changes are saved first (as vscode-R's Source does)
  if (doc.isDirty) await doc.save();
  if (!context.globalState.get<boolean>('auraR.runStepsNoticeShown')) {
    void context.globalState.update('auraR.runStepsNoticeShown', true);
    void vscode.window.showInformationMessage(RUN_STEPS_NOTICE);
  }
  const code = runStepsCode(doc.fileName, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
  const run = async () => {
    deps.output.appendLine(`Run my steps from the top: ${code}`);
    await deps.runInSession(code);
  };
  if (!(await deps.requireTrust('running your steps', run))) return;
  await run();
}

/** Jump to a banner line the AURA panel lists, in the script the student works in. */
async function goToLine(line: number): Promise<void> {
  const s = stepsScript();
  const editor = vscode.window.activeTextEditor ?? (s ? await vscode.window.showTextDocument(typeof s === 'string' ? await vscode.workspace.openTextDocument(s) : s) : undefined);
  if (!editor || typeof line !== 'number') return;
  const pos = new vscode.Position(Math.min(line, editor.document.lineCount - 1), 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.AtTop);
  await vscode.window.showTextDocument(editor.document, editor.viewColumn);
}

// ---------------- the write-code wizard ----------------

async function writeCodeCommand(deps: MenuDeps, presetTask?: string): Promise<void> {
  const course = deps.currentCourse() ?? (await deps.pickCourse(false));
  if (!course) return;
  const profile = profileOf(course);
  // U2: in MC 427 the Test menu is always a check on Copilot's code
  const crossCheck = course === 'mc427';

  const offered = CATALOG.filter((t) => offers(profile, t.task, deps.apaCheck()));
  const preset = presetTask ? offered.find((t) => t.task === presetTask) : undefined;
  if (presetTask && !preset) {
    vscode.window.showWarningMessage(`${course.toUpperCase()} does not offer that task. Pick another from Write R code.`);
    return;
  }
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
  const chosen = preset
    ? { def: preset }
    : await vscode.window.showQuickPick(picks, {
        title: `Write R code (${course.toUpperCase()})`,
        placeHolder: 'Pick a task',
        matchOnDescription: true,
      });
  const def = chosen?.def;
  if (!def) return;

  // These open a webview, a command, or a second pick instead of writing one block directly
  if (def.task === 'reliability') return reliabilityFlow(deps, profile, def.label);
  if (def.task === 'check-test-choice') return vscode.commands.executeCommand('auraR.checkTestChoice');
  if (def.task === 'import-csv') {
    await importDataFile(deps, profile, def.label);
    return;
  }
  if (def.task === 'join-tables') return joinTablesFlow(deps, profile, def.label);
  if (def.task === 'sample') return sampleFlow(deps, profile, def.label);
  if (def.task === 'crosstab') return crosstabFlow(deps, profile, def.label);
  if (def.task === 'agreement') return agreementFlow(deps, profile, def.label);
  if (def.task === 'settings-block') return settingsFlow(deps, profile, def.label);
  if (def.task in DESCRIBE_ASKS) return describeFlow(deps, profile, def.task, def.label);
  if (profile === 'mc427' && def.task in MC427_TEST_ASKS) return describeFlow(deps, profile, def.task, def.label, MC427_TEST_ASKS);
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

  const code = generate(profile, task, params);
  // U2: in MC 427 Module 5, Copilot writes the graded
  // analysis and the Test menu checks it. Shown with the Run prompt, not after it, so it appears
  // even when the student never answers that prompt.
  const note = crossCheck && R4_TEST_TASKS.has(def.task) ? COPILOT_CHECK : undefined;
  await insertAndMaybeRun(deps, code, def.label, task, note);
}

// ---------------- Import a data file (0.5.3) ----------------

/** A file (and table name) chosen before the import starts: the AURA panel and the test suites. */
export interface ImportPreset {
  file?: string;
  name?: string;
}

// Pick the file, name the table, choose the Excel sheet, and look at the columns before anything
// is written (RStudio's import preview and JASP's CSV preview in one list). Esc at any step writes
// nothing.
async function importDataFile(deps: MenuDeps, profile: GenProfile, label: string, preset: ImportPreset = {}): Promise<ImportedTable | undefined> {
  const picked = preset.file ? [vscode.Uri.file(preset.file)] : await vscode.window.showOpenDialog({
    title: 'Pick the data file to import',
    canSelectMany: false,
    openLabel: 'Import',
    filters: { 'Data files (CSV or Excel)': ['csv', 'xlsx', 'xls'], 'CSV files': ['csv'], 'Excel files': ['xlsx', 'xls'], 'All files': ['*'] },
  });
  const file = picked?.[0]?.fsPath;
  if (!file) return;
  const kind = dataFileKind(file);
  if (kind !== 'csv' && kind !== 'excel') {
    vscode.window.showWarningMessage(
      kind === 'rds'
        ? 'That is an RDS file. Use Load your saved analysis (RDS) for it, or pick a .csv, .xlsx, or .xls file here.'
        : 'Pick a .csv, .xlsx, or .xls file.',
    );
    return;
  }
  const name = preset.name ?? await vscode.window.showInputBox({
    title: label,
    prompt: 'What do you want to call this table in R?',
    value: tableNameFromFile(file),
    validateInput: (v) => tableNameProblem(v.trim()),
    ignoreFocusOut: true,
  });
  if (!name) return;

  let sheet: string | undefined;
  if (kind === 'excel') {
    let sheets: string[];
    try {
      sheets = await listExcelSheets(deps, file);
    } catch (e: any) {
      deps.output.appendLine(`Could not list the sheets in ${file}: ${e?.message ?? e}`);
      vscode.window.showErrorMessage('R could not read that Excel file. Run AURA: Check my setup, then try again.', 'Show output').then((b) => b && deps.output.show());
      return;
    }
    if (sheets.length === 0) {
      vscode.window.showWarningMessage('That Excel file has no sheets to read.');
      return;
    }
    sheet = sheets[0];
    if (sheets.length > 1) {
      const pick = await vscode.window.showQuickPick(
        sheets.map((s, i) => ({ label: s, description: i === 0 ? 'first sheet' : undefined })),
        { title: label, placeHolder: 'Which sheet holds your data?' },
      );
      if (!pick) return;
      sheet = pick.label;
    }
  }

  // The peek: the columns R will read, with their types. A failed probe (no R yet) still writes
  // the block, since the student may install R next and run it then.
  let probe: ColumnProbe | undefined;
  try {
    probe = await runColumnProbe(deps, probeExpr(file, sheet));
  } catch (e: any) {
    deps.output.appendLine(`Peek skipped: ${e?.message ?? e}`);
  }
  if (probe) {
    const items: (vscode.QuickPickItem & { accept?: boolean })[] = [
      { label: '$(check) Write the code that loads this table', detail: `as ${name.trim()}`, accept: true },
      { label: 'Columns', kind: vscode.QuickPickItemKind.Separator },
      ...probe.columns.map((c) => ({ label: c.name, description: typeWord(c.type), detail: pickerHint(c, probe!.rows) })),
    ];
    const ok = await vscode.window.showQuickPick(items, {
      title: peekSummary(probe),
      placeHolder: 'Press Enter to write the code, or Esc to cancel',
      matchOnDescription: true,
    });
    if (!ok) return;
  }

  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const where = scriptPath(file, folder);
  if (where.outside) void vscode.window.showWarningMessage(OUTSIDE_NOTICE);
  const params: GenParams = { data: name.trim(), file: where.path, sheet };
  // janitor is required in MC 451 and MC 501 only
  if (profile !== 'mc427' && probe && namesNeedCleaning(probe).length > 0) params.cleanNames = true;
  const task = kind === 'excel' ? 'import-xlsx' : 'import-csv';
  await insertAndMaybeRun(deps, generate(profile, task, params), label, task, undefined, [name.trim()]);
  const expr = probeExpr(file, sheet);
  return { name: name.trim(), probe: params.cleanNames ? `janitor::clean_names(${expr})` : expr };
}

/** A table an import wrote, and the R that reads it again without the student's session. */
interface ImportedTable {
  name: string;
  probe: string;
}

// ---------------- Join two tables by a shared column (0.5.3) ----------------

const A_DATA_FILE = '$(folder-opened) A data file';

// Pick the table to keep every row of, the table to take columns from, and the shared column.
// The tables offered are the ones the script assigns above the cursor or a run block made; a
// data file is imported first. The key list is the columns both tables have when R can read both
// without the student's session; otherwise the key is typed and checked against the side it can
// read. A key that repeats on the right gets a warning before anything is written.
async function joinTablesFlow(deps: MenuDeps, profile: GenProfile, label: string): Promise<void> {
  const editor = vscode.window.activeTextEditor ?? (lastTextDoc && !lastTextDoc.doc.isClosed ? { document: lastTextDoc.doc, selection: lastTextDoc.selection } : undefined);
  const above = editor ? editor.document.getText(new vscode.Range(new vscode.Position(0, 0), editor.selection.active)) : '';
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const sources = tableSources(above, folder);
  const rds = folder ? path.join(folder, 'data', 'twitch_analysis.RDS') : undefined;
  if (rds && fs.existsSync(rds)) sources.set('analysis', `readRDS(${JSON.stringify(rds.replace(/\\/g, '/'))})`);
  const names = [...new Set([...assignedNames(above), ...ranTables])];

  const pickTable = async (title: string, placeHolder: string, exclude?: string): Promise<ImportedTable | undefined> => {
    const items = names
      .filter((n) => n !== exclude)
      .map((n) => ({ label: n, description: sources.has(n) ? undefined : 'made in your script', value: n }));
    const chosen = await vscode.window.showQuickPick([...items, { label: A_DATA_FILE, description: 'import it first', value: '' }], { title, placeHolder });
    if (!chosen) return undefined;
    if (!chosen.value) return importDataFile(deps, profile, 'Import a data file (CSV or Excel)');
    return { name: chosen.value, probe: sources.get(chosen.value) ?? '' };
  };

  const left = await pickTable(label, 'The table you keep every row of');
  if (!left) return;
  const right = await pickTable(label, 'The table you take columns from', left.name);
  if (!right) return;

  const probeOf = async (t: ImportedTable): Promise<ColumnProbe | undefined> => {
    if (!t.probe) return undefined;
    try {
      return await runColumnProbe(deps, t.probe);
    } catch (e: any) {
      deps.output.appendLine(`Could not read the columns of ${t.name}: ${e?.message ?? e}`);
      return undefined;
    }
  };
  const [lp, rp] = [await probeOf(left), await probeOf(right)];
  let key: string | undefined;
  if (lp && rp) {
    const shared = sharedColumns(lp.columns.map((c) => c.name), rp.columns.map((c) => c.name));
    if (shared.length === 0) {
      vscode.window.showWarningMessage(`${left.name} and ${right.name} have no column with the same name, so they cannot be joined yet. Rename one with rename() first.`);
      return;
    }
    const pick = await vscode.window.showQuickPick(
      shared.map((c) => ({ label: c, description: typeWord(rp.columns.find((x) => x.name === c)!.type) })),
      { title: label, placeHolder: `The column ${left.name} and ${right.name} share` },
    );
    key = pick?.label;
  } else {
    const known = (lp ?? rp)?.columns.map((c) => c.name);
    key = await vscode.window.showInputBox({
      title: label,
      prompt: `The column ${left.name} and ${right.name} share`,
      validateInput: (v) =>
        !/^[A-Za-z.][A-Za-z0-9._]*$/.test(v.trim())
          ? 'Type one column name, with no spaces or quotation marks.'
          : known && !known.includes(v.trim())
            ? `${(lp ? left : right).name} has no column named ${v.trim()}.`
            : undefined,
      ignoreFocusOut: true,
    });
    key = key?.trim();
  }
  if (!key) return;

  if (rp) {
    const col = rp.columns.find((c) => c.name === key);
    const warning = col ? repeatWarning(key, right.name, col.n_distinct, rp.rows) : undefined;
    if (warning) {
      const go = await vscode.window.showWarningMessage(warning, 'Write the join anyway');
      if (!go) return;
    }
  }

  const how = await vscode.window.showQuickPick(
    [
      { label: `Keep every row of ${left.name}`, description: 'left_join(), the usual choice', inner: false as boolean },
      { label: 'Keep only rows that match on both sides', description: 'inner_join()', inner: true },
    ],
    { title: label, placeHolder: 'Which rows do you keep?' },
  );
  if (!how) return;
  const params: GenParams = { data: left.name, right: right.name, column: key, keepOnlyMatches: how.inner };
  await insertAndMaybeRun(deps, generate(profile, 'join-tables', params), label, 'join-tables', undefined, [`${left.name}_${right.name}`]);
}

// ---------------- Reliability from the coding sheet (code parity, 2026-10-28) ----------------

// The coding sheet's pass 1 and pass 2 columns (tone_p1 and tone_p2) are what the pilot checks.
// The pairs come from the coding sheet file the rebuild block saved; with none yet, the student
// can still use the reliability grid.
async function reliabilityFlow(deps: MenuDeps, profile: GenProfile, label: string): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const derived = folder ? path.join(folder, 'data', 'derived') : undefined;
  const sheets = derived && fs.existsSync(derived) ? fs.readdirSync(derived).filter((f) => /coding-sheet\.csv$/i.test(f)).sort() : [];
  const GRID = 'grid';
  const route = await vscode.window.showQuickPick(
    [
      ...sheets.map((f) => ({ label: `$(table) From my coding sheet: ${f}`, detail: 'Compare the _p1 and _p2 columns you coded in the data viewer', value: f })),
      { label: '$(checklist) The reliability grid', detail: 'Type pass 1 and pass 2 codes for a short list of items', value: GRID },
    ],
    { title: label, placeHolder: sheets.length ? 'Which codes do you check?' : 'No coding sheet yet: code with Code it twice in the data viewer, or use the grid' },
  );
  if (!route) return;
  if (route.value === GRID) {
    await vscode.commands.executeCommand('auraR.openReliabilityGrid');
    return;
  }
  const sheetFile = path.join(derived!, route.value);
  let probe: ColumnProbe;
  try {
    probe = await runColumnProbe(deps, `readr::read_csv(${JSON.stringify(sheetFile.replace(/\\/g, '/'))}, show_col_types = FALSE)`);
  } catch (e: any) {
    deps.output.appendLine(`Could not read ${sheetFile}: ${e?.message ?? e}`);
    vscode.window.showErrorMessage('R could not read your coding sheet. Run AURA: Check my setup, then try again.');
    return;
  }
  const names = probe.columns.map((c) => c.name);
  const pairs = passPairs(names);
  if (pairs.length === 0) {
    vscode.window.showWarningMessage(
      `${route.value} has no pass 1 and pass 2 columns. In the data viewer, add a coding column and choose Code it twice; that makes tone_p1 and tone_p2.`,
    );
    return;
  }
  const chosen = await vscode.window.showQuickPick(
    pairs.map((p) => ({ label: p.variable, description: `${p.first} and ${p.second}`, picked: true, p })),
    { title: label, canPickMany: true, placeHolder: 'Which variables do you check?' },
  );
  if (!chosen || chosen.length === 0) return;
  const blocks = chosen.map(({ p }) => reliabilityForPair(profile, p));
  await insertAndMaybeRun(deps, blocks.join('\n'), label, 'reliability', undefined, chosen.map(({ p }) => `${p.variable}_passes`));
}

// ---------------- Draw a coding sample (code parity, 2026-10-28) ----------------

// Pick the table, the column to draw within (or none), how many rows, the seed, and the CSV to
// save. Every choice ends up in the block, so rerunning the script draws the same rows.
// The tables the script has made so far, the course table, or a data file to import first; then
// its columns, read by the column probe when R can read the table on its own.
async function pickTable(
  deps: MenuDeps,
  profile: GenProfile,
  label: string,
  placeHolder: string,
  course: string,
): Promise<{ table: ImportedTable; probe?: ColumnProbe } | undefined> {
  const editor = vscode.window.activeTextEditor ?? (lastTextDoc && !lastTextDoc.doc.isClosed ? { document: lastTextDoc.doc, selection: lastTextDoc.selection } : undefined);
  const above = editor ? editor.document.getText(new vscode.Range(new vscode.Position(0, 0), editor.selection.active)) : '';
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const sources = tableSources(above, folder);
  const names = [...new Set([...assignedNames(above), ...ranTables])];
  const items = names.map((n) => ({ label: n, description: sources.has(n) ? undefined : 'made in your script', value: n }));
  if (!names.includes(course)) {
    items.unshift({
      label: course,
      description: profile === 'mc427' ? 'load your data file above this first' : 'Load the course Twitch corpus above this first',
      value: course,
    });
  }
  const chosen = await vscode.window.showQuickPick([...items, { label: A_DATA_FILE, description: 'import it first', value: '' }], { title: label, placeHolder });
  if (!chosen) return undefined;
  const table: ImportedTable | undefined = chosen.value
    ? { name: chosen.value, probe: sources.get(chosen.value) ?? (chosen.value === 'chat' && profile !== 'mc427' ? 'v2v::twitch_chat()' : '') }
    : await importDataFile(deps, profile, 'Import a data file (CSV or Excel)');
  if (!table) return undefined;
  let probe: ColumnProbe | undefined;
  if (table.probe) {
    try {
      probe = await runColumnProbe(deps, table.probe);
    } catch (e: any) {
      deps.output.appendLine(`Could not read the columns of ${table.name}: ${e?.message ?? e}`);
    }
  }
  return { table, probe };
}

const COLUMN_NAME = (v: string) => (v.trim() && !/^[A-Za-z.][A-Za-z0-9._]*$/.test(v.trim()) ? 'Type one column name, with no spaces or quotation marks.' : undefined);

// Crosstab of two columns the student picks (code parity, 2026-10-28), such as their codes and the
// AI's codes on the coding sheet in MC 427 Module 4. The course example stays the first choice.
async function crosstabFlow(deps: MenuDeps, profile: GenProfile, label: string): Promise<void> {
  const how = await vscode.window.showQuickPick(
    [
      { label: 'Choose the table and the two columns', description: "such as your codes and the AI's codes", value: 'choose' },
      { label: 'Use the course example', description: profile === 'mc427' ? 'update by posted_from, in df' : 'viewer_band by channel_type, in analysis', value: 'default' },
    ],
    { title: label, placeHolder: 'Which two columns do you count together?' },
  );
  if (!how) return;
  if (how.value === 'default') return insertAndMaybeRun(deps, generate(profile, 'crosstab', {}), label, 'crosstab');
  const picked = await pickTable(deps, profile, label, 'Which table has the two columns?', profile === 'mc427' ? 'df' : 'analysis');
  if (!picked) return;
  const columns = await pickColumnsInTurn(label, picked.probe, [
    'First column: its values become the rows',
    'Second column: its values become the columns of the grid',
  ]);
  if (!columns) return;
  const table = picked.table;
  await insertAndMaybeRun(deps, generate(profile, 'crosstab', { data: table.name, columns }), label, 'crosstab');
}

// Pick columns one at a time from the probe (or typed when R cannot read the table on its own).
type ColumnAsk = string | { prompt: string; fits?: (c: ProbeColumn) => boolean };

// Pick columns one at a time from the probe (or typed when R cannot read the table on its own).
// A prompt with fits lists the columns that fit first, then the rest.
async function pickColumnsInTurn(label: string, probe: ColumnProbe | undefined, asks: ColumnAsk[]): Promise<string[] | undefined> {
  const out: string[] = [];
  for (const ask of asks) {
    const prompt = typeof ask === 'string' ? ask : ask.prompt;
    const fits = typeof ask === 'string' ? undefined : ask.fits;
    if (probe) {
      const left = probe.columns.filter((c) => !out.includes(c.name));
      const ordered = fits ? [...left.filter(fits), ...left.filter((c) => !fits(c))] : left;
      const c = await vscode.window.showQuickPick(
        ordered.map((c) => ({ label: c.name, description: c.type, detail: pickerHint(c, probe.rows), value: c.name })),
        { title: label, placeHolder: prompt, matchOnDetail: true },
      );
      if (!c) return undefined;
      out.push(c.value);
    } else {
      const typed = await vscode.window.showInputBox({ title: label, prompt: `${prompt}. Type its name.`, validateInput: COLUMN_NAME, ignoreFocusOut: true });
      if (!typed) return undefined;
      out.push(typed.trim());
    }
  }
  return out;
}

const isNumber = (c: ProbeColumn) => c.type === 'dbl' || c.type === 'int';
const isTime = (c: ProbeColumn) => c.type === 'dttm' || c.type === 'date';
const isGroup = (c: ProbeColumn) => !isNumber(c) && !isTime(c);

// The Describe tasks on the student's own columns (owner q-20261028-0011 = A): the bar chart,
// histogram, boxplot, line chart, and summary by group. Choosing comes first; the course example
// stays on the list. Titles and axis labels are YOUR TURN lines in the code.
const DESCRIBE_ASKS: Record<string, { example: string; asks: ColumnAsk[] }> = {
  bar: { example: 'the course bar chart', asks: [{ prompt: 'The column to count: one bar per value', fits: isGroup }] },
  histogram: { example: 'the course histogram', asks: [{ prompt: 'The number column to spread out', fits: isNumber }] },
  boxplot: {
    example: 'the course boxplot',
    asks: [{ prompt: 'The number column the boxes show', fits: isNumber }, { prompt: 'The column to group by: one box per value', fits: isGroup }],
  },
  'grouped-summary': {
    example: 'the course summary',
    asks: [{ prompt: 'The column to group by', fits: isGroup }, { prompt: 'The number column to summarize', fits: isNumber }],
  },
  line: { example: 'the course line chart', asks: [{ prompt: 'The time column (a date or a date-time)', fits: isTime }] },
};

const COPILOT_CHECK =
  'Module 5: Copilot writes your analysis code. Use this block to check it, and log any difference as a Copilot error you caught.';

// The MC 427 tests on the student's own columns (owner, 2026-10-28: nothing hard-coded to the
// course data). MC 451 and MC 501 choose theirs once, in the settings block.
const isTwoGroups = (c: ProbeColumn) => c.n_distinct - (c.n_missing ? 1 : 0) === 2;
const MC427_TEST_ASKS: Record<string, { example: string; asks: ColumnAsk[] }> = {
  't-test': { example: 'like_count by share_button', asks: [{ prompt: 'The number column (the outcome)', fits: isNumber }, { prompt: 'The column with exactly two groups', fits: isTwoGroups }] },
  't-test-missing': { example: 'playtime by voted_up, dropping missing values', asks: [{ prompt: 'The number column (the outcome)', fits: isNumber }, { prompt: 'The column with exactly two groups', fits: isTwoGroups }] },
  'chi-square': { example: 'update by posted_from', asks: [{ prompt: 'The first category column', fits: isGroup }, { prompt: 'The second category column', fits: isGroup }] },
  anova: { example: 'log_likes by update', asks: [{ prompt: 'The number column (the outcome)', fits: isNumber }, { prompt: 'The column with three or more groups', fits: isGroup }] },
  regression: { example: 'word_count predicting like_count', asks: [{ prompt: 'The number column you predict (the outcome)', fits: isNumber }, { prompt: 'The number column that predicts it', fits: isNumber }] },
  correlation: { example: 'word_count and like_count', asks: [{ prompt: 'The first number column', fits: isNumber }, { prompt: 'The second number column', fits: isNumber }] },
};

async function describeFlow(deps: MenuDeps, profile: GenProfile, task: string, label: string, table = DESCRIBE_ASKS): Promise<void> {
  const spec = table[task];
  const note = profile === 'mc427' && R4_TEST_TASKS.has(task) ? COPILOT_CHECK : undefined;
  const how = await vscode.window.showQuickPick(
    [
      { label: 'Choose the table and the columns', description: 'your own data or the course data', value: 'choose' },
      { label: 'Use the course example', description: spec.example, value: 'default' },
    ],
    { title: label, placeHolder: 'Which columns does this use?' },
  );
  if (!how) return;
  if (how.value === 'default') return insertAndMaybeRun(deps, generate(profile, task, {}), label, task, note);
  const picked = await pickTable(deps, profile, label, 'Which table?', profile === 'mc427' ? 'df' : 'analysis');
  if (!picked) return;
  const columns = await pickColumnsInTurn(label, picked.probe, spec.asks);
  if (!columns) return;
  const params: GenParams = { data: picked.table.name, columns };
  if (task === 'line') {
    const col = picked.probe?.columns.find((c) => c.name === columns[0]);
    params.unit = col?.type === 'date' ? 'day' : 'hour';
    const left = (picked.probe?.columns ?? []).filter((c) => c.name !== columns[0] && isGroup(c));
    const g = await vscode.window.showQuickPick(
      [{ label: '$(list-flat) One line: no groups', value: '' }, ...left.map((c) => ({ label: c.name, description: c.type, detail: pickerHint(c, picked.probe!.rows), value: c.name }))],
      { title: label, placeHolder: 'One line per group? Pick the column, or one line.' },
    );
    if (!g) return;
    params.groupBy = g.value;
  }
  await insertAndMaybeRun(deps, generate(profile, task, params), label, task, note);
}

// Agreement between two code columns (MC 427 Module 4, code parity 2026-10-28): your codes and the
// AI's codes on the coding sheet, with the item's id for the list of disagreements.
async function agreementFlow(deps: MenuDeps, profile: GenProfile, label: string): Promise<void> {
  const picked = await pickTable(deps, profile, label, 'Which table is your coding sheet?', 'codes');
  if (!picked) return;
  const cols = await pickColumnsInTurn(label, picked.probe, [
    'Your code column (such as sentiment)',
    "The column to compare it with (such as ai_sentiment, the AI's codes)",
    'The id column, to list each disagreement (such as review_id)',
  ]);
  if (!cols) return;
  await insertAndMaybeRun(deps, generate(profile, 'agreement', { data: picked.table.name, columns: [cols[0], cols[1]], column: cols[2] }), label, 'agreement');
}

// The tests' settings block with the student's own variables (code parity, 2026-10-28): every test
// reads outcome, group2, group3, predictor, cat_a, and cat_b, so picking them here runs every test
// on the student's own data with no R typed by hand. Each pick offers the course choice first.
async function settingsFlow(deps: MenuDeps, profile: GenProfile, label: string): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const rel = 'data/twitch_analysis.RDS';
  const how = await vscode.window.showQuickPick(
    [
      { label: 'Use the course variables', description: 'message_length, channel_type, viewer_band, hour(ts)', value: 'default' },
      { label: 'Choose my own variables', description: `from ${rel} or another saved file`, value: 'choose' },
    ],
    { title: label, placeHolder: 'Which variables do the tests use?' },
  );
  if (!how) return;
  if (how.value === 'default') return insertAndMaybeRun(deps, generate(profile, 'settings-block', {}), label, 'settings-block');
  // The course file, or any RDS the student saved from their own data
  const course = folder ? path.join(folder, rel) : undefined;
  const where = await vscode.window.showQuickPick(
    [
      ...(course && fs.existsSync(course) ? [{ label: rel, description: 'your saved course analysis', value: course }] : []),
      { label: 'Another RDS file...', description: 'such as one you saved from your own data', value: '' },
    ],
    { title: label, placeHolder: 'Which saved file do the tests read?' },
  );
  if (!where) return;
  let file = where.value;
  if (!file) {
    const picked = await vscode.window.showOpenDialog({ title: 'Pick the RDS file the tests read', canSelectMany: false, filters: { 'R data': ['rds', 'RDS'] } });
    if (!picked || !picked.length) return;
    file = picked[0].fsPath;
  }
  const fileRel = folder && path.resolve(file).toLowerCase().startsWith(path.resolve(folder).toLowerCase() + path.sep)
    ? path.relative(folder, file).split(path.sep).join('/')
    : file.replace(/\\/g, '/');
  let probe: ColumnProbe;
  try {
    probe = await runColumnProbe(deps, probeExpr(file));
  } catch (e: any) {
    void vscode.window.showWarningMessage(`Could not read the columns of ${fileRel}: ${e?.message ?? e}`);
    return;
  }
  const numeric = (c: ProbeColumn) => c.type === 'dbl' || c.type === 'int';
  const roles: { role: string; what: string; course: string; fits: (c: ProbeColumn) => boolean }[] = [
    { role: 'outcome', what: 'a number (the t-test, ANOVA, and regression outcome)', course: 'message_length', fits: numeric },
    { role: 'group2', what: 'a category with exactly two groups (the t-test)', course: 'channel_type', fits: (c) => c.n_distinct - (c.n_missing ? 1 : 0) === 2 },
    { role: 'group3', what: 'a category with three or more groups (the ANOVA)', course: 'viewer_band', fits: (c) => !numeric(c) && c.n_distinct >= 3 },
    { role: 'predictor', what: 'a number (the regression and correlation predictor)', course: 'hour(ts)', fits: numeric },
    { role: 'cat_a', what: 'a category (the chi-square, first)', course: 'viewer_band', fits: (c) => !numeric(c) },
    { role: 'cat_b', what: 'a category (the chi-square, second)', course: 'channel_type', fits: (c) => !numeric(c) },
  ];
  const columns: string[] = [];
  for (const r of roles) {
    const fitting = probe.columns.filter(r.fits);
    const pick = await vscode.window.showQuickPick(
      (fitting.length ? fitting : probe.columns).map((c) => ({ label: c.name, description: c.type, detail: pickerHint(c, probe.rows), value: c.name })),
      { title: `${label}: ${r.role}`, placeHolder: `${r.role} is ${r.what}. The course uses ${r.course}.`, matchOnDetail: true },
    );
    if (!pick) return;
    columns.push(pick.value);
  }
  await insertAndMaybeRun(deps, generate(profile, 'settings-block', { columns, file: fileRel }), label, 'settings-block');
}

async function sampleFlow(deps: MenuDeps, profile: GenProfile, label: string): Promise<void> {
  const picked = await pickTable(deps, profile, label, 'Which table do you draw the sample from?', profile === 'mc427' ? 'df' : 'chat');
  if (!picked) return;
  const { table, probe } = picked;
  const noGroups = '$(list-flat) No groups: draw from the whole table';
  let groupBy: string | undefined;
  if (probe) {
    const cols = categoryColumns(probe).length ? categoryColumns(probe) : probe.columns;
    const pick = await vscode.window.showQuickPick(
      [
        { label: noGroups, description: 'a simple random sample', value: '' },
        ...cols.map((c) => ({ label: c.name, description: `the same number from each ${c.name}`, detail: pickerHint(c, probe!.rows), value: c.name })),
      ],
      { title: label, placeHolder: 'Draw the same number of rows from each group? Pick the column, or no groups.' },
    );
    if (!pick) return;
    groupBy = pick.value;
  } else {
    const typed = await vscode.window.showInputBox({
      title: label,
      prompt: 'Draw the same number of rows from each group? Type the column name, or leave it empty for no groups.',
      value: table.name === 'chat' && profile !== 'mc427' ? 'channel' : '',
      validateInput: COLUMN_NAME,
      ignoreFocusOut: true,
    });
    if (typed === undefined) return;
    groupBy = typed.trim();
  }

  const whole = (v: string) => (/^\d+$/.test(v.trim()) && Number(v) >= 1 ? undefined : 'Type a whole number, 1 or more.');
  const nText = await vscode.window.showInputBox({
    title: label,
    prompt: groupBy ? `How many rows from each ${groupBy}?` : 'How many rows in the sample?',
    value: profile === 'mc427' ? '50' : groupBy ? '30' : '100',
    validateInput: whole,
    ignoreFocusOut: true,
  });
  if (!nText) return;
  const seedText = await vscode.window.showInputBox({
    title: label,
    prompt: 'Pick a seed: any whole number. The same seed draws the same rows every time. Write it in your sampling plan.',
    value: String(100 + Math.floor(Math.random() * 9900)),
    validateInput: whole,
    ignoreFocusOut: true,
  });
  if (!seedText) return;
  const file = await vscode.window.showInputBox({
    title: label,
    prompt: 'File name to save the sample as (you open this file in the data viewer to code it)',
    value: profile === 'mc427' ? 'coding-sample.csv' : 'data/coding-sample.csv',
    validateInput: (v) => (/\.csv$/i.test(v.trim()) ? undefined : 'End the file name with .csv'),
    ignoreFocusOut: true,
  });
  if (!file) return;
  const params: GenParams = { data: table.name, groupBy, n: Number(nText), seed: Number(seedText), file: file.trim() };
  await insertAndMaybeRun(deps, generate(profile, 'sample', params), label, 'sample', undefined, ['coding_sample']);
}

/** The sheet names in an Excel workbook, read by R into a JSON file (never console text). */
async function listExcelSheets(deps: MenuDeps, file: string): Promise<string[]> {
  const rscript = deps.rscriptPath();
  if (!rscript) throw new Error('R was not found. Run Check my setup first.');
  fs.mkdirSync(deps.storageDir, { recursive: true });
  const stamp = Date.now();
  const outPath = path.join(deps.storageDir, `sheets-${stamp}.json`);
  const scriptPathR = path.join(deps.storageDir, `sheets-${stamp}.R`);
  fs.writeFileSync(scriptPathR, `${sheetListExpr(file, outPath)}\n`);
  try {
    const res = await deps.runRscript(rscript, [scriptPathR], 60000);
    if (!fs.existsSync(outPath)) {
      deps.output.appendLine(res.stdout);
      deps.output.appendLine(res.stderr);
      throw new Error('R did not list the sheets.');
    }
    const sheets = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    return Array.isArray(sheets) ? sheets.map(String) : [];
  } finally {
    fs.rmSync(outPath, { force: true });
    fs.rmSync(scriptPathR, { force: true });
  }
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
  const editor = vscode.window.activeTextEditor ?? (lastTextDoc && !lastTextDoc.doc.isClosed ? { document: lastTextDoc.doc, selection: lastTextDoc.selection } : undefined);
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
      filters: { Data: ['csv', 'CSV', 'xlsx', 'xls', 'rds', 'RDS'] },
    });
    if (!file || file.length === 0) return;
    source = probeExpr(file[0].fsPath);
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
  const script = fillProbe(tpl, dataExpr, outPath);
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
async function insertAndMaybeRun(deps: MenuDeps, code: string, label: string, task?: string, note?: string, makes: string[] = []): Promise<void> {
  const editor = await scriptEditor();
  const steps = stepsFile();
  if (!editor && steps) {
    // No script open (0.5.3, coordinator decision on spec Rank 5): the block goes to the end of
    // steps.R in the course folder, so every block lives in exactly one script. The file is made
    // only now, by the first block written, never on activation.
    const before = fs.existsSync(steps) ? fs.readFileSync(steps, 'utf8') : '';
    fs.writeFileSync(steps, appendBlock(before, code));
    const doc = await vscode.workspace.openTextDocument(steps);
    const shown = await vscode.window.showTextDocument(doc, { preview: false });
    const end = new vscode.Position(doc.lineCount - 1, 0);
    shown.selection = new vscode.Selection(end, end);
    shown.revealRange(new vscode.Range(end, end));
    deps.output.appendLine(`No script was open, so the code went to the end of ${steps}.`);
  } else if (!editor) {
    // No course folder open either: an unsaved script, as before
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
      // Watch for the chart before the block is sent, so a fast R cannot save it unseen
      const chart = CHART_TASKS.has(task ?? '') ? watchSavedChart(deps.output, code) : undefined;
      try {
        await deps.runInSession(code);
      } catch (e) {
        chart?.cancel();
        throw e;
      }
      for (const name of [...(MAKES[task ?? ''] ?? []), ...makes]) ranTables.add(name);
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
  // The variable and its codes come from the student's codebook (until 0.5.4 the grid was fixed to
  // tone: calm or high-energy, so no other codebook could use it)
  const variable = await vscode.window.showInputBox({
    title: 'Reliability grid',
    prompt: 'Which codebook variable do you check? Type its name exactly as your codebook names it.',
    value: DEFAULT_GRID.variable,
    validateInput: (v) => (/^[A-Za-z][A-Za-z0-9_]*$/.test(v.trim()) ? undefined : 'Start with a letter; use only letters, numbers, and underscores.'),
    ignoreFocusOut: true,
  });
  if (!variable) return;
  const rawCodes = await vscode.window.showInputBox({
    title: `Reliability grid: ${variable.trim()}`,
    prompt: 'Copy the values for this variable from your codebook and paste or type them here, separated by commas',
    value: variable.trim() === DEFAULT_GRID.variable ? DEFAULT_GRID.codes.join(', ') : '',
    validateInput: (v) => (v.split(',').map((s) => s.trim()).filter(Boolean).length >= 2 ? undefined : 'List at least two values.'),
    ignoreFocusOut: true,
  });
  if (!rawCodes) return;
  const rowsText = await vscode.window.showInputBox({
    title: `Reliability grid: ${variable.trim()}`,
    prompt: 'How many items do you code twice?',
    value: String(DEFAULT_GRID.rows),
    validateInput: (v) => (/^\d+$/.test(v.trim()) && Number(v) >= 2 && Number(v) <= 500 ? undefined : 'Type a whole number from 2 to 500.'),
    ignoreFocusOut: true,
  });
  if (!rowsText) return;
  const panel = vscode.window.createWebviewPanel('auraReliabilityGrid', 'Reliability grid', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  const cfg: GridConfig = {
    ...DEFAULT_GRID,
    variable: variable.trim(),
    codes: [...new Set(rawCodes.split(',').map((s) => s.trim()).filter(Boolean))],
    rows: Number(rowsText),
  };
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
    await saveGridAndGenerate(deps, course as CourseId, result, panel, script, cfg.variable);
  }, undefined, context.subscriptions);
}

async function saveGridAndGenerate(
  deps: MenuDeps,
  course: CourseId,
  result: GridResult,
  panel: vscode.WebviewPanel,
  script: vscode.TextEditor | undefined,
  variable: string,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  // One file per variable, so checking a second variable never overwrites the first one's codes
  const fileName = gridFileName(variable);
  const csvRel = `data/derived/${fileName}`;
  let target: vscode.Uri;
  if (folder) {
    target = vscode.Uri.joinPath(folder.uri, 'data', 'derived', fileName);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, 'data', 'derived'));
  } else {
    target = vscode.Uri.file(path.join(deps.storageDir, fileName));
    fs.mkdirSync(deps.storageDir, { recursive: true });
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(gridCsv(result), 'utf8'));
  deps.output.appendLine(`Saved ${result.rows.filter((r) => r.pass_1 && r.pass_2).length} coded items to ${target.fsPath}`);

  // The generated block loads the saved pilot CSV into `pilot`, then runs the statistic. The golden
  // reliability code shows both Cohen's kappa and Krippendorff's alpha, so the student can compare;
  // the grid's statistic choice is recorded in the write-up. The block writes the irr calls, with
  // the v2v wrapper last as a check (q-20261018-0044 = A).
  const table = `${variable}_passes`;
  const importBlock = generate(profileOf(course), 'import-csv', { file: csvRel, data: table });
  const relBlock = generate(profileOf(course), 'reliability', { data: table });
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
