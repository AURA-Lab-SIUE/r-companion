// The AURA panel (0.5.3, #rgui Rank 4): an Activity Bar view with My setup, Data, Describe, Test,
// Your steps, and Help. A native tree view, so it is keyboard and screen-reader accessible as
// VS Code's own trees are (arrow keys, type-ahead, the tree role) and has a Focus command in the
// Command Palette ("AURA: Focus on R Companion View"). The tree itself comes from panelModel.ts.

import * as vscode from 'vscode';
import { CourseId } from './profiles';
import { panelTree, scriptBanners, PanelNode, MenuItem } from './panelModel';

export interface PanelHost {
  currentCourse: () => CourseId | undefined;
  items: (course: CourseId) => MenuItem[];
  crossCheck: (course: CourseId) => boolean;
  /** The script Run my steps from the top would run, by file name. */
  stepsScript: () => string | undefined;
}

export class AuraPanel implements vscode.TreeDataProvider<PanelNode> {
  private readonly changed = new vscode.EventEmitter<PanelNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private setupLine: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly host: PanelHost) {}

  /** Refresh after the last Check my setup, with its one-line summary. */
  setSetupLine(line: string): void {
    this.setupLine = line;
    this.refresh();
  }

  refresh(): void {
    this.changed.fire(undefined);
  }

  /** Banners change as the student types; redraw at most every half second. */
  refreshSoon(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 500);
  }

  roots(): PanelNode[] {
    const course = this.host.currentCourse();
    const editor = vscode.window.activeTextEditor;
    const banners = editor && editor.document.uri.scheme !== 'output' ? scriptBanners(editor.document.getText()) : [];
    return panelTree({
      course,
      items: course ? this.host.items(course) : [],
      crossCheck: course ? this.host.crossCheck(course) : false,
      setupLine: this.setupLine,
      banners,
      stepsScript: this.host.stepsScript(),
    });
  }

  getChildren(node?: PanelNode): PanelNode[] {
    return node ? node.children ?? [] : this.roots();
  }

  getTreeItem(node: PanelNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.label,
      node.children ? (['setup', 'data', 'steps'].includes(node.id) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) : vscode.TreeItemCollapsibleState.None,
    );
    item.id = node.id;
    item.description = node.description;
    item.tooltip = node.tooltip ?? node.label;
    // A screen reader reads the label and its description, never the tooltip (which is a URL or a
    // hint): without this the status line was announced as its tooltip
    item.accessibilityInformation = { label: node.description ? `${node.label}, ${node.description}` : node.label };
    if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
    if (node.command) item.command = { title: node.label, command: node.command.command, arguments: node.command.args };
    return item;
  }
}

export function registerPanel(context: vscode.ExtensionContext, host: PanelHost): AuraPanel {
  const panel = new AuraPanel(host);
  const view = vscode.window.createTreeView('auraR.panel', { treeDataProvider: panel, showCollapseAll: true });
  const setCourseKey = () => void vscode.commands.executeCommand('setContext', 'auraR.courseSet', !!host.currentCourse());
  setCourseKey();
  context.subscriptions.push(
    view,
    vscode.commands.registerCommand('auraR.refreshPanel', () => panel.refresh()),
    vscode.window.onDidChangeActiveTextEditor(() => panel.refresh()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) panel.refreshSoon();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('auraR')) {
        setCourseKey();
        panel.refresh();
      }
    }),
  );
  return panel;
}
