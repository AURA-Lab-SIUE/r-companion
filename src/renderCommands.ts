// The VS Code side of render.ts: Render this document and Preview this document.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { renderFolderProblem } from './render';

const QUARTO_EXT = 'quarto.quarto';

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
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const problem = renderFolderProblem(ed.document.fileName, root, ed.document.getText());
  if (problem && root) {
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
