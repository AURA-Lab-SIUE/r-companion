// R4 Copilot tools: three language-model tools GitHub Copilot Chat's agent mode can call (#rgui).
//
// Check my R setup, Explain an R error, and Check my test choice. None changes a file, installs
// anything, or runs the student's analysis. Owner decision U3 (coordinator default, reversible
// through auraR.copilotTools): MC 427 forbids letting Agent mode run anything (R Field Guide C15),
// so `auto` registers them off in the mc427 profile and on for MC 451 and MC 501. The package.json
// contribution carries `when: auraR.copilotToolsOn`, and each tool also refuses when switched off,
// so a stale picker can never reach one. The extension works the same with Copilot off.

import * as vscode from 'vscode';
import { CourseId, PROFILES } from './profiles';
import { ComparisonKind, OutcomeKind, TestId, TEST_LABEL } from './testChoice';
import { CopilotToolsSetting, copilotToolsOn, explainForModel, testChoiceForModel } from './toolText';

export { CopilotToolsSetting } from './toolText';

/** A one-line summary per checklist item, for a tool result. */
export interface SetupSummary {
  course: CourseId;
  lines: string[];
  ok: boolean;
}

export interface ToolDeps {
  setting: () => CopilotToolsSetting;
  currentCourse: () => CourseId | undefined;
  /** Run the setup check without showing the checklist (read-only). */
  checkSetup: (course: CourseId) => Promise<SetupSummary>;
}

export const TOOL_NAMES = {
  setup: 'aura_r_check_setup',
  error: 'aura_r_explain_error',
  test: 'aura_r_check_test_choice',
} as const;

const text = (s: string) => new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(s)]);

/** Set the `when` context key and register the three tools. */
export function registerCopilotTools(context: vscode.ExtensionContext, deps: ToolDeps): void {
  const refresh = () =>
    void vscode.commands.executeCommand('setContext', 'auraR.copilotToolsOn', copilotToolsOn(deps.setting(), deps.currentCourse()));
  refresh();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('auraR')) refresh();
    }),
  );
  // Older VS Code (before 1.95) has no tools API: the extension works without it
  if (!vscode.lm || typeof vscode.lm.registerTool !== 'function') return;

  const off = () => {
    const course = deps.currentCourse();
    if (copilotToolsOn(deps.setting(), course)) return undefined;
    const where = course ? PROFILES[course].short : 'this course';
    return text(`The AURA Lab R Companion's Copilot tools are switched off in ${where}. Do not try another route: answer from what the student shows you, or point them to the command palette (AURA: Check my setup, AURA: Explain an R error).`);
  };

  context.subscriptions.push(
    vscode.lm.registerTool<Record<string, never>>(TOOL_NAMES.setup, {
      prepareInvocation: () => ({ invocationMessage: 'Checking R and the course packages (read-only)' }),
      invoke: async () => {
        const blocked = off();
        if (blocked) return blocked;
        const course = deps.currentCourse();
        if (!course) return text('No course is set yet. Ask the student to run AURA: Pick my course from the command palette, then try again.');
        const s = await deps.checkSetup(course);
        const verdict = s.ok
          ? 'Everything the course needs is installed and loads.'
          : 'Something is missing. Tell the student to run AURA: Install what is missing from the command palette; this tool installs nothing.';
        return text([`Setup check for ${PROFILES[course].label}:`, ...s.lines, verdict].join('\n'));
      },
    }),
    vscode.lm.registerTool<{ message: string }>(TOOL_NAMES.error, {
      prepareInvocation: () => ({ invocationMessage: 'Looking up the R message in the course error table' }),
      invoke: async (options) => {
        const blocked = off();
        if (blocked) return blocked;
        return text(explainForModel(String(options.input?.message ?? ''), deps.currentCourse()));
      },
    }),
    vscode.lm.registerTool<{ outcome: OutcomeKind; comparison: ComparisonKind; chosenTest: TestId }>(TOOL_NAMES.test, {
      prepareInvocation: (options) => ({
        invocationMessage: `Checking the student's choice: ${TEST_LABEL[options.input.chosenTest] ?? options.input.chosenTest}`,
      }),
      invoke: async (options) => {
        const blocked = off();
        if (blocked) return blocked;
        return text(testChoiceForModel(options.input));
      },
    }),
  );
}
