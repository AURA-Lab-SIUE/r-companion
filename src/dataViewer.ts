// The data viewer and coding sheet (release R3-grid).
//
// Opens a CSV file, or an R data frame through the bridge, in an AG Grid webview. Data values are
// read only. The student adds coding columns and types a value per row; every change is saved to a
// separate long codes file, data/derived/<name>-codes.csv, and the original file is never written.
// A Refresh button re-reads the data. The viewer can insert the tidyverse chunk that rebuilds the
// coded data. The self-contained HTML for the axe check is made by scripts/verify/export-grid-html.mjs
// (the toolbar button for it was removed in 0.5.3).

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { LoadedData, CodingColumn } from './dataTypes';
import { loadCsvFile, loadRDataFrame, runRscriptSync } from './dataSource';
import { CodeStore } from './codesStore';
import { rebuildChunk } from './rebuild';
import { webviewHtml } from './gridHtml';
import { prepareInsert, isQuartoFile, isInsideRChunk } from './insert';
import { dataFileKind, probeExpr, sheetListExpr, tableNameFromFile } from './importFile';

export interface ViewerDeps {
  /** Path to Rscript, or undefined when R was not found. */
  rscript(): string | undefined;
  /** Absolute path to resources/bridge.R. */
  bridgeScript: string;
  /** Absolute path to the extension's media/grid folder. */
  mediaRoot: string;
  output: vscode.OutputChannel;
}

const panels = new Map<string, DataViewerPanel>();

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** The workspace folder that holds a path, or the first folder, or the path's own folder. */
function folderFor(p: string): string {
  const uri = vscode.Uri.file(p);
  const ws = vscode.workspace.getWorkspaceFolder(uri) ?? vscode.workspace.workspaceFolders?.[0];
  return ws ? ws.uri.fsPath : path.dirname(p);
}

/** Forward-slash relative path from folder to target, for the generated R and the webview. */
function relForward(folder: string, target: string): string {
  return path.relative(folder, target).split(path.sep).join('/');
}

// ---------- the open command ----------

export async function openDataViewer(context: vscode.ExtensionContext, deps: ViewerDeps, file?: string): Promise<void> {
  // A file given by the caller (the test suites) skips the first pick
  const source = file ? (dataFileKind(file) === 'excel' ? await excelSource(deps, file) : { kind: 'csv' as const, path: file }) : await pickSource(deps);
  if (!source) return;
  let data: LoadedData;
  try {
    data = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'AURA: Loading the data' },
      async () => loadSource(source, deps),
    );
  } catch (e: any) {
    deps.output.appendLine(`Data viewer load failed: ${e?.message ?? e}`);
    vscode.window.showErrorMessage(`Could not load the data: ${e?.message ?? e}`, 'Show output').then((b) => b && deps.output.show());
    return;
  }
  const key = data.sourcePath;
  const existing = panels.get(key);
  if (existing) {
    existing.reveal();
    return;
  }
  const panel = new DataViewerPanel(context, deps, data);
  panels.set(key, panel);
  panel.onDispose(() => panels.delete(key));
}

type Source =
  | { kind: 'csv'; path: string }
  | { kind: 'rdataframe'; expr: string; name: string };

async function pickSource(deps: ViewerDeps): Promise<Source | undefined> {
  const active = vscode.window.activeTextEditor?.document;
  const items: (vscode.QuickPickItem & { run: () => Promise<Source | undefined> })[] = [];
  if (active && /\.csv$/i.test(active.uri.fsPath) && active.uri.scheme === 'file') {
    items.push({
      label: '$(table) The CSV open in the editor',
      detail: active.uri.fsPath,
      run: async () => ({ kind: 'csv', path: active.uri.fsPath }),
    });
  }
  items.push({
    label: '$(folder-opened) Pick a data file (CSV or Excel)',
    detail: 'Choose a .csv, .xlsx, or .xls file from this computer',
    run: async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Data files (CSV or Excel)': ['csv', 'xlsx', 'xls'], 'All files': ['*'] },
        openLabel: 'Open in the data viewer',
      });
      const file = picked?.[0]?.fsPath;
      if (!file) return undefined;
      return dataFileKind(file) === 'excel' ? excelSource(deps, file) : { kind: 'csv', path: file };
    },
  });
  if (deps.rscript()) {
    for (const ds of COURSE_DATASETS) {
      items.push({
        label: `$(graph) ${ds.label}`,
        detail: ds.expr,
        run: async () => ({ kind: 'rdataframe', expr: ds.expr, name: ds.name }),
      });
    }
    items.push({
      label: '$(code) An R data frame (type an expression)',
      detail: 'For example  read_csv("data.csv")  or  mtcars',
      run: async () => {
        const expr = await vscode.window.showInputBox({
          title: 'Open an R data frame',
          prompt: 'Type an R expression that makes a data frame',
          placeHolder: 'v2v::twitch_chat()',
          ignoreFocusOut: true,
        });
        if (!expr) return undefined;
        const name = (expr.match(/[A-Za-z0-9_]+/g)?.pop() ?? 'data').slice(0, 40);
        return { kind: 'rdataframe', expr, name };
      },
    });
  }
  const choice = await vscode.window.showQuickPick(items, {
    title: 'Open the data viewer',
    placeHolder: 'What do you want to view or code?',
  });
  return choice ? choice.run() : undefined;
}

// An Excel sheet opens through the R bridge (readxl::read_excel), like any R data frame, so the
// viewer needs no reader of its own. With more than one sheet the student picks one, and the sheet
// name goes into the derived file names so each sheet keeps its own codes.
async function excelSource(deps: ViewerDeps, file: string): Promise<Source | undefined> {
  const rscript = deps.rscript();
  if (!rscript) {
    vscode.window.showErrorMessage('Opening an Excel file needs R. Run AURA: Check my setup.');
    return undefined;
  }
  const stamp = Date.now();
  const out = path.join(os.tmpdir(), `aura-sheets-${stamp}.json`);
  const script = path.join(os.tmpdir(), `aura-sheets-${stamp}.R`);
  let sheets: string[] = [];
  try {
    fs.writeFileSync(script, `${sheetListExpr(file, out)}\n`);
    const res = runRscriptSync(rscript, [script]);
    if (!fs.existsSync(out)) throw new Error(res.stderr.slice(0, 400) || 'R did not list the sheets.');
    sheets = (JSON.parse(fs.readFileSync(out, 'utf8')) as unknown[]).map(String);
  } catch (e: any) {
    deps.output.appendLine(`Could not list the sheets in ${file}: ${e?.message ?? e}`);
    vscode.window.showErrorMessage('R could not read that Excel file. Run AURA: Check my setup, then try again.');
    return undefined;
  } finally {
    fs.rmSync(out, { force: true });
    fs.rmSync(script, { force: true });
  }
  if (sheets.length === 0) return undefined;
  let sheet = sheets[0];
  if (sheets.length > 1) {
    const pick = await vscode.window.showQuickPick(sheets, { title: 'Open in the data viewer', placeHolder: 'Which sheet?' });
    if (!pick) return undefined;
    sheet = pick;
  }
  const base = tableNameFromFile(file);
  const name = sheets.length > 1 ? `${base}_${tableNameFromFile(sheet)}` : base;
  return { kind: 'rdataframe', expr: probeExpr(file, sheet), name };
}

const COURSE_DATASETS = [
  { label: 'Twitch chat (the course sample)', expr: 'v2v::twitch_chat()', name: 'twitch_chat' },
  { label: 'Twitch streams (the course sample)', expr: 'v2v::twitch_streams()', name: 'twitch_streams' },
];

function loadSource(source: Source, deps: ViewerDeps): LoadedData {
  if (source.kind === 'csv') return loadCsvFile(source.path);
  const rscript = deps.rscript();
  if (!rscript) throw new Error('R was not found. Run AURA: Check my setup.');
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(deps.bridgeScript);
  const derived = path.join(folder, 'data', 'derived');
  return loadRDataFrame(rscript, deps.bridgeScript, source.expr, source.name, derived, runRscriptSync);
}

// ---------- the panel ----------

class DataViewerPanel {
  private panel: vscode.WebviewPanel;
  private store: CodeStore;
  private coding: CodingColumn[];
  private folder: string;
  private originalHash: string | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private disposables: vscode.Disposable[] = [];
  private disposeCbs: (() => void)[] = [];

  constructor(private context: vscode.ExtensionContext, private deps: ViewerDeps, private data: LoadedData) {
    this.folder = folderFor(data.sourcePath);
    const codesPath = path.join(this.folder, 'data', 'derived', `${data.name}-codes.csv`);
    this.store = CodeStore.load(codesPath);
    this.coding = this.restoreCoding();
    this.originalHash = this.hashSource();

    this.panel = vscode.window.createWebviewPanel('auraDataViewer', `Data: ${data.name}`, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(this.deps.mediaRoot)],
    });
    this.panel.webview.html = this.html();
    this.disposables.push(this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m)));
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.deps.output.appendLine(
      `Data viewer opened: ${data.name} (${data.rows.length} rows, ${data.origin}). Codes file: ${codesPath}`,
    );
  }

  reveal() {
    this.panel.reveal();
  }

  onDispose(cb: () => void) {
    this.disposeCbs.push(cb);
  }

  private hashSource(): string | undefined {
    try {
      return fs.existsSync(this.data.sourcePath) ? sha256(this.data.sourcePath) : undefined;
    } catch {
      return undefined;
    }
  }

  private codingKey(): string {
    return `auraR.coding:${this.data.sourcePath}`;
  }

  private restoreCoding(): CodingColumn[] {
    const saved = this.context.workspaceState.get<CodingColumn[]>(this.codingKey());
    if (saved && saved.length) return saved;
    // If no metadata was saved, rebuild bare columns from whatever the codes file already has.
    return this.store.columnsWithData().map((name) => ({ name, kind: 'free' as const }));
  }

  private async persistCoding() {
    await this.context.workspaceState.update(this.codingKey(), this.coding);
  }

  private initPayload() {
    const codes: Record<string, Record<string, string>> = {};
    for (const row of this.data.rows) {
      const id = String(row[this.data.rowIdField]);
      const vals = this.store.rowValues(id);
      if (Object.keys(vals).length) codes[id] = vals;
    }
    return {
      title: `${this.data.name} (${this.data.rows.length.toLocaleString()} rows)`,
      columns: this.data.columns,
      rows: this.data.rows,
      rowIdField: this.data.rowIdField,
      codingColumns: this.coding,
      codes,
    };
  }

  private onMessage(m: any) {
    switch (m?.type) {
      case 'ready':
        this.postInit();
        break;
      case 'rendered':
        this.deps.output.appendLine(`Grid rendered ${m.rows} rows in ${m.renderMs} ms.`);
        break;
      case 'codeChange':
        this.onCodeChange(String(m.rowId), String(m.column), String(m.value ?? ''));
        break;
      case 'addColumn':
        void this.addColumn();
        break;
      case 'refresh':
        void this.refresh();
        break;
      case 'insertRebuild':
        void this.insertRebuild();
        break;
    }
  }

  private postInit() {
    void this.panel.webview.postMessage({ type: 'init', init: this.initPayload() });
  }

  private onCodeChange(rowId: string, column: string, value: string) {
    this.store.set(rowId, column, value, nowIso());
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(true), 250);
  }

  /** Writes the codes file now. Called on every debounce tick and once more on dispose. */
  private flush(announce: boolean) {
    this.saveTimer = undefined;
    try {
      this.store.save();
      this.assertOriginalUntouched();
      if (announce) {
        void this.panel.webview.postMessage({
          type: 'saved',
          at: new Date().toLocaleTimeString(),
          count: this.store.toRecords().length,
        });
      }
    } catch (e: any) {
      this.deps.output.appendLine(`Could not save the codes file: ${e?.message ?? e}`);
      vscode.window.showErrorMessage(`Could not save your codes: ${e?.message ?? e}`);
    }
  }

  private assertOriginalUntouched() {
    if (this.data.origin !== 'csv' || this.originalHash === undefined) return;
    const now = this.hashSource();
    if (now && now !== this.originalHash) {
      this.deps.output.appendLine(
        `WARNING: the original data file changed on disk since it was opened (${this.data.sourcePath}). The viewer did not write it.`,
      );
    }
  }

  private async addColumn() {
    const taken = new Set([
      ...this.data.columns.map((c) => c.field.toLowerCase()),
      ...this.coding.map((c) => c.name.toLowerCase()),
    ]);
    const name = await vscode.window.showInputBox({
      title: 'Add a coding column',
      prompt: 'Name your coding column (letters, numbers, and underscores work best in R)',
      ignoreFocusOut: true,
      validateInput: (v) => {
        const t = v.trim();
        if (!t) return 'Type a name.';
        if (taken.has(t.toLowerCase())) return 'That name is already a column.';
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(t)) return 'Start with a letter; use only letters, numbers, and underscores.';
        return null;
      },
    });
    if (!name) return;
    const kindPick = await vscode.window.showQuickPick(
      [
        { label: 'Allowed values (a dropdown)', detail: 'Type or paste your codebook values; in a cell, type the first letters of a code', colKind: 'list' as const },
        { label: 'Free text', detail: 'Any text, no menu', colKind: 'free' as const },
      ],
      { title: `Coding column "${name.trim()}": what kind?`, placeHolder: 'Choose how you will enter values' },
    );
    if (!kindPick) return;
    let values: string[] | undefined;
    if (kindPick.colKind === 'list') {
      const raw = await vscode.window.showInputBox({
        title: `Allowed values for "${name.trim()}"`,
        prompt: 'Type or paste your codebook values, separated by commas',
        placeHolder: 'positive, neutral, negative',
        ignoreFocusOut: true,
        validateInput: (v) => (v.split(',').map((s) => s.trim()).filter(Boolean).length ? null : 'List at least one value.'),
      });
      if (raw === undefined) return;
      values = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
    }
    const column: CodingColumn = { name: name.trim(), kind: kindPick.colKind, values };
    this.coding.push(column);
    await this.persistCoding();
    void this.panel.webview.postMessage({ type: 'columnAdded', column });
  }

  private async refresh() {
    try {
      const source: Source =
        this.data.origin === 'csv'
          ? { kind: 'csv', path: this.data.sourcePath }
          : { kind: 'rdataframe', expr: this.data.sourceExpr!, name: this.data.name };
      this.data = loadSource(source, this.deps);
      this.originalHash = this.hashSource();
      this.postInit();
      void this.panel.webview.postMessage({ type: 'status', text: 'Refreshed from disk.' });
      this.deps.output.appendLine(`Refreshed ${this.data.name}: ${this.data.rows.length} rows.`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Could not refresh: ${e?.message ?? e}`);
    }
  }

  private async insertRebuild() {
    const chunk = rebuildChunk({
      dataRelPath: relForward(this.folder, this.data.sourcePath),
      codesRelPath: relForward(this.folder, this.store.filePath),
      addedRowId: this.data.addedRowId,
      origin: this.data.origin,
      sourceExpr: this.data.sourceExpr,
      codingColumns: this.coding.map((c) => c.name),
    });
    const editor = vscode.window.visibleTextEditors.find((e) => /\.(R|r|qmd|Rmd)$/.test(e.document.uri.fsPath));
    if (editor) {
      // In a Quarto document the code goes in an R chunk, or it would be prose (seen in the 0.4.0
      // command-API run, 2026-10-19): the cursor's own chunk, or a new one
      const doc = editor.document;
      const quarto = isQuartoFile(doc.fileName) || doc.languageId === 'quarto' || doc.languageId === 'rmd';
      const above = doc.getText(new vscode.Range(new vscode.Position(0, 0), editor.selection.active)).split(/\r?\n/);
      const plan = prepareInsert(chunk, quarto, quarto ? isInsideRChunk(above) : true);
      await editor.edit((b) => b.insert(editor.selection.active, plan.text));
      await vscode.window.showTextDocument(editor.document, editor.viewColumn);
      vscode.window.showInformationMessage('Inserted the code that rebuilds your coded data.');
    } else {
      const doc = await vscode.workspace.openTextDocument({ language: 'r', content: chunk });
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      vscode.window.showInformationMessage('Opened the rebuild code in a new R file. Save it into your project.');
    }
  }

  private html(): string {
    const uri = (p: string) =>
      this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(this.deps.mediaRoot, p))).toString();
    const nonce = crypto.randomBytes(16).toString('base64');
    return webviewHtml({
      nonce,
      cspSource: this.panel.webview.cspSource,
      agGridJs: uri('ag-grid-community.min.js'),
      agGridCss: uri('ag-grid.min.css'),
      themeCss: uri('ag-theme-quartz.min.css'),
      gridCss: uri('grid.css'),
      gridJs: uri('grid.js'),
      title: this.initPayload().title,
    });
  }

  private dispose() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.flush(false); // save any pending change before the panel goes away
    }
    for (const d of this.disposables) d.dispose();
    for (const cb of this.disposeCbs) cb();
  }
}
