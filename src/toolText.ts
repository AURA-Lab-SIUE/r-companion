// The text the R4 Copilot tools return, and when they are on (#rgui). Pure: no VS Code API, so
// the unit tests load it directly. copilotTools.ts registers the tools around these.

import { CourseId } from './profiles';
import { explain } from './errors';
import { checkTestChoice, ComparisonKind, OutcomeKind, TestId, TEST_LABEL } from './testChoice';

export type CopilotToolsSetting = 'auto' | 'on' | 'off';

/** Are the tools on for this course? `auto`: on for MC 451 and MC 501, off for MC 427 (U3). */
export function copilotToolsOn(setting: CopilotToolsSetting, course: CourseId | undefined): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return course === 'mc451' || course === 'mc501';
}

/** The error tool's answer: each matching table entry, or a plain "not in the table". */
export function explainForModel(message: string, course: CourseId | undefined): string {
  if (!message.trim()) return 'No message was given. Ask the student to copy the exact text R printed.';
  const found = explain(message, course);
  if (found.length === 0) {
    return "This message is not in the course's table of common R errors. Explain it from the message itself, in plain English, and point the student to the line that produced it.";
  }
  return found
    .map(({ entry }) =>
      [
        entry.title,
        entry.why,
        'What to do:',
        ...entry.fix.map((f, i) => `${i + 1}. ${f}`),
        ...(entry.link ? [`Course help page: ${entry.link.label}, ${entry.link.url}`] : []),
      ].join('\n'),
    )
    .join('\n\n');
}

/** The test tool's answer. It checks the student's choice; it never names a test unprompted. */
export function testChoiceForModel(input: { outcome?: string; comparison?: string; chosenTest?: string }): string {
  const outcome = input.outcome as OutcomeKind;
  const comparison = input.comparison as ComparisonKind;
  const chosen = input.chosenTest as TestId;
  if (!['categorical', 'numeric'].includes(outcome) || !['categorical-two-groups', 'categorical-three-plus-groups', 'numeric'].includes(comparison) || !TEST_LABEL[chosen]) {
    return "The student's variables or chosen test are missing. Ask them what kind of variable each one is and which test they chose; choosing the test is graded, so do not choose it for them.";
  }
  const v = checkTestChoice(outcome, comparison, chosen);
  return `${v.fits ? 'Fits.' : 'Does not fit.'} ${v.reason} Choosing the test is graded work: do not name a different test for the student.`;
}
