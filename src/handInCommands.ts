// The VS Code side of handIn.ts: Make my submission ZIP, Render or Preview this document,
// and Bring a file into my course folder.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { bringTarget, buildZip, downloadsFolder, renderFolderProblem, zipFileList, zipNameFor, zipReport } from './handIn';

const QUARTO_EXT = 'quarto.quarto';

function courseRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function needFolder(): Promise<string | undefined> {
  const root = courseRoot();
  if (!root) {
    const go = await vscode.window.showWarningMessage('Open your course folder first. Then choose this again.', 'Open my course workspace');
    if (go) void vscode.commands.executeCommand('auraR.openCourseWorkspace');
  }
  return root;
}

export async function makeSubmissionZip(): Promise<void> {
  const root = await needFolder();
  if (!root) return;
  const dirty = vscode.workspace.textDocuments.filter((d) => d.isDirty && d.uri.fsPath.startsWith(root));
  if (dirty.length > 0) {
    const save = await vscode.window.showWarningMessage(
      `${dirty.length} open file(s) have changes that are not saved. Save them so the ZIP holds your latest work?`,
      'Save all and continue',
      'Cancel',
    );
    if (save !== 'Save all and continue') return;
    await vscode.workspace.saveAll(false);
  }
  const target = await vscode.window.showSaveDialog({
    title: 'Save your submission ZIP',
    saveLabel: 'Make the ZIP here',
    defaultUri: vscode.Uri.file(path.join(downloadsFolder(), zipNameFor(root))),
    filters: { 'ZIP file': ['zip'] },
  });
  if (!target) return;
  const zipPath = target.fsPath;
  const files = zipFileList(root, zipPath);
  const zip = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Packing ${files.length} files into ${path.basename(zipPath)}` },
    async () =>
      buildZip(
        files.map((f) => {
          const abs = path.join(root, f);
          return { name: f, data: fs.readFileSync(abs), mtime: fs.statSync(abs).mtime };
        }),
      ),
  );
  fs.writeFileSync(zipPath, zip);
  const remote = vscode.env.remoteName !== undefined;
  const choice = await vscode.window.showInformationMessage(zipReport(files, zipPath, zip.length), remote ? 'Show it in the Explorer' : 'Show the ZIP in its folder');
  if (choice && remote) void vscode.commands.executeCommand('revealInExplorer', target);
  else if (choice) void vscode.commands.executeCommand('revealFileInOS', target);
}

export async function renderOrPreview(kind: 'render' | 'preview'): Promise<void> {
  const ed = vscode.window.activeTextEditor;
  if (!ed || !/\.qmd$/i.test(ed.document.fileName)) {
    void vscode.window.showWarningMessage('Click into the .qmd worksheet first, so it is the open file. Then choose this again.');
    return;
  }
  if (!vscode.extensions.getExtension(QUARTO_EXT)) {
    const go = await vscode.window.showWarningMessage('Rendering needs the Quarto extension. Choose Install what is missing to add it.', 'Install what is missing');
    if (go) void vscode.commands.executeCommand('auraR.installMissing');
    return;
  }
  const problem = renderFolderProblem(ed.document.fileName, courseRoot(), ed.document.getText());
  if (problem) {
    const root = courseRoot()!;
    const move = await vscode.window.showWarningMessage(problem, 'Move it to the top folder', 'Render anyway');
    if (move === undefined) return;
    if (move === 'Move it to the top folder') {
      const dest = path.join(root, path.basename(ed.document.fileName));
      if (fs.existsSync(dest)) {
        void vscode.window.showWarningMessage(`A file named ${path.basename(dest)} is already in the top folder. Rename one of them, then try again.`);
        return;
      }
      await ed.document.save();
      const edit = new vscode.WorkspaceEdit();
      edit.renameFile(ed.document.uri, vscode.Uri.file(dest));
      await vscode.workspace.applyEdit(edit);
      await vscode.window.showTextDocument(vscode.Uri.file(dest));
    }
  }
  await vscode.window.activeTextEditor?.document.save();
  await vscode.commands.executeCommand(kind === 'render' ? 'quarto.renderDocument' : 'quarto.preview');
}

export async function bringFileIn(course: string | undefined): Promise<void> {
  const root = await needFolder();
  if (!root) return;
  const picked = await vscode.window.showOpenDialog({
    title: 'Pick the file to copy into your course folder',
    openLabel: 'Copy into my course folder',
    canSelectMany: true,
    defaultUri: vscode.Uri.file(downloadsFolder()),
  });
  if (!picked || picked.length === 0) return;
  const copied: { dest: string; codePath: string }[] = [];
  for (const uri of picked) {
    const t = bringTarget(root, course, uri.fsPath);
    if (path.resolve(uri.fsPath) === path.resolve(t.dest)) continue;
    fs.mkdirSync(path.dirname(t.dest), { recursive: true });
    if (fs.existsSync(t.dest)) {
      const ok = await vscode.window.showWarningMessage(`${t.codePath} is already in your course folder. Replace it with the one you picked?`, 'Replace it', 'Keep the one I have');
      if (ok !== 'Replace it') continue;
    }
    fs.copyFileSync(uri.fsPath, t.dest);
    copied.push(t);
  }
  if (copied.length === 0) return;
  const where = course === 'mc427' ? 'your course folder' : 'the data folder';
  const names = copied.map((c) => `"${c.codePath}"`).join(', ');
  const show = await vscode.window.showInformationMessage(`Copied into ${where}. Your code reads it as ${names}. The file in Downloads is still there.`, 'Show it');
  if (show) void vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(copied[0].dest));
}
