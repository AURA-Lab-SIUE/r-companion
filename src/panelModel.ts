// The AURA panel (0.5.3, #rgui Rank 4): the tree it shows, built from the course alone. No VS Code
// API here, so the unit tests load it directly and check every course's tree, including the
// MC 427 gates the menus use. panel.ts turns these nodes into tree items.
//
// The panel is a second door to the same commands, not a replacement: every task node runs Write R
// code straight into that task, with the menu's own label, so the guides and videos still match.

import { CourseId, PROFILES } from './profiles';

export interface PanelCommand {
  command: string;
  args?: unknown[];
}

export interface PanelNode {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  /** A codicon name, for example "play" or "link-external". */
  icon?: string;
  command?: PanelCommand;
  children?: PanelNode[];
}

/** One Write R code item, as menus.ts lists it for the course. */
export interface MenuItem {
  task: string;
  label: string;
  category: string;
  alternative?: boolean;
}

/** A "# ---- title ----" banner in the open script, and its line (0-based). */
export interface Banner {
  label: string;
  line: number;
}

export interface PanelInput {
  course?: CourseId;
  /** The Write R code items the course offers, in menu order. */
  items: MenuItem[];
  /** MC 427 under U2: the Test menu checks Copilot's code. */
  crossCheck: boolean;
  /** The last Check my setup result in one line, or undefined before the first check. */
  setupLine?: string;
  /** The banners of the script in the active editor. */
  banners: Banner[];
  /** The script Run my steps from the top would run, by file name, if there is one. */
  stepsScript?: string;
}

/** The "# ---- title ----" banners every generated block opens with (RStudio's section marker). */
export function scriptBanners(text: string): Banner[] {
  const out: Banner[] = [];
  text.split(/\r?\n/).forEach((l, line) => {
    const m = /^\s*# -{4} (.+?) -{4}\s*$/.exec(l);
    if (m) out.push({ label: m[1], line });
  });
  return out;
}

/**
 * The guides and videos for each course: one front door per course (owner decision 2026-10-22).
 * MC 427's R Field Guide lives in Blackboard, which has no stable public address, so MC 427 shows
 * its help links only.
 */
export const GUIDES: Partial<Record<CourseId, { label: string; url: string }>> = {
  mc451: { label: 'Step-by-step guides and videos', url: 'https://aura-lab.siue.edu/v2v-hub/guides/mc451/' },
  mc501: { label: 'Step-by-step guides and videos', url: 'https://aura-lab.siue.edu/v2v-hub/guides/mc501/' },
};

const write = (task: string): PanelCommand => ({ command: 'auraR.writeCode', args: [task] });

function taskNode(prefix: string, it: MenuItem): PanelNode {
  // These three open their own command or webview, as they do from the menu
  const command =
    it.task === 'reliability'
      ? { command: 'auraR.openReliabilityGrid' }
      : it.task === 'check-test-choice'
        ? { command: 'auraR.checkTestChoice' }
        : write(it.task);
  return { id: `${prefix}/${it.task}`, label: it.label, description: it.alternative ? 'alternative' : undefined, icon: 'code', command };
}

export function panelTree(input: PanelInput): PanelNode[] {
  const course = input.course;
  const by = (category: string) => input.items.filter((i) => i.category === category);

  const setup: PanelNode = {
    id: 'setup',
    label: 'My setup',
    icon: 'tools',
    children: [
      {
        id: 'setup/status',
        label: input.setupLine ?? 'Not checked yet',
        tooltip: 'From the last Check my setup. Select it to check again.',
        icon: input.setupLine === undefined ? 'circle-outline' : /to fix/.test(input.setupLine) ? 'warning' : 'pass',
        command: { command: 'auraR.checkSetup' },
      },
      { id: 'setup/check', label: 'Check my setup', icon: 'checklist', command: { command: 'auraR.checkSetup' } },
      { id: 'setup/install', label: 'Install what is missing', icon: 'cloud-download', command: { command: 'auraR.installMissing' } },
      { id: 'setup/course', label: 'Pick my course', description: course ? PROFILES[course].short : undefined, icon: 'mortar-board', command: { command: 'auraR.pickCourse' } },
      { id: 'setup/workspace', label: 'Open my course workspace', icon: 'folder-opened', command: { command: 'auraR.openCourseWorkspace' } },
      { id: 'setup/terminal', label: 'Open an R terminal', icon: 'terminal', command: { command: 'auraR.openRTerminal' } },
    ],
  };

  const data: PanelNode = {
    id: 'data',
    label: 'Data',
    icon: 'database',
    children: [
      ...by('R2 Data').map((i) => taskNode('data', i)),
      { id: 'data/viewer', label: 'Open the data viewer', icon: 'table', command: { command: 'auraR.openDataViewer' } },
      // Rank 6, owner q-20261022-0005 = A: vscode-R's Workspace panel is the environment view
      {
        id: 'data/objects',
        label: 'Objects in R: open the Workspace panel',
        description: 'empty until R is attached',
        tooltip: "The R extension's Workspace panel lists every table and function your R session has.",
        icon: 'symbol-variable',
        command: { command: 'auraR.openWorkspaceView' },
      },
      {
        id: 'data/not-attached',
        label: 'R shows (not attached)? Fix it',
        icon: 'debug-disconnect',
        command: { command: 'auraR.fixNotAttached' },
      },
    ],
  };

  const describe: PanelNode = { id: 'describe', label: 'Describe', icon: 'graph', children: by('R3 Describe').map((i) => taskNode('describe', i)) };
  const test: PanelNode = {
    id: 'test',
    label: input.crossCheck ? "Test: a check on Copilot's code" : 'Test',
    icon: 'beaker',
    children: by('R4 Test').map((i) => taskNode('test', i)),
  };

  const steps: PanelNode = {
    id: 'steps',
    label: 'Your steps',
    icon: 'list-ordered',
    children: [
      { id: 'steps/open', label: 'Open my steps', description: input.stepsScript, icon: 'go-to-file', command: { command: 'auraR.openSteps' } },
      { id: 'steps/run', label: 'Run my steps from the top', icon: 'run-all', command: { command: 'auraR.runSteps' } },
      ...input.banners.map((b) => ({
        id: `steps/banner/${b.line}`,
        label: b.label,
        description: `line ${b.line + 1}`,
        icon: 'symbol-namespace',
        command: { command: 'auraR.goToLine', args: [b.line] },
      })),
    ],
  };

  const helpLinks = course ? PROFILES[course].help : [];
  const help: PanelNode = {
    id: 'help',
    label: 'Help',
    icon: 'question',
    children: [
      { id: 'help/explain', label: 'Explain an R error', icon: 'lightbulb', command: { command: 'auraR.explainError' } },
      { id: 'help/where', label: 'Where to get help', icon: 'comment-discussion', command: { command: 'auraR.getHelp' } },
      ...(course && GUIDES[course]
        ? [{ id: 'help/guides', label: GUIDES[course]!.label, tooltip: GUIDES[course]!.url, icon: 'book', command: { command: 'auraR.openLink', args: [GUIDES[course]!.url] } }]
        : []),
      ...helpLinks.map((h, i) => ({ id: `help/link/${i}`, label: h.label, tooltip: h.url, icon: 'link-external', command: { command: 'auraR.openLink', args: [h.url] } })),
    ],
  };

  // Before a course is picked the view shows its welcome text and a Pick my course button
  if (!course) return [];
  return [setup, data, describe, test, steps, help].filter((n) => n.children === undefined || n.children.length > 0);
}
