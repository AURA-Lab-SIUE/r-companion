// Check my test choice (R4): does the test a student chose fit their variables?
//
// Owner decision U4 (coordinator default, reversible through auraR.testChoice): choosing the test
// is graded (MC 427 A01 and A02, the MC 451 and MC 501 Inferencing rubrics), so by default the
// student picks the test and this only says whether it fits. The rules are the ones the three
// courses teach: chi-square for two categories, Welch t-test for a number across two groups,
// one-way ANOVA for three or more groups, regression or correlation for two numbers.
// Pure: no VS Code API, so the unit tests and the Copilot tool share it.

export type OutcomeKind = 'categorical' | 'numeric';
export type ComparisonKind = 'categorical-two-groups' | 'categorical-three-plus-groups' | 'numeric';
export type TestId = 'chi-square' | 't-test' | 'anova' | 'regression' | 'correlation';

export const TEST_LABEL: Record<TestId, string> = {
  'chi-square': 'chi-square test of independence',
  't-test': 'Welch t-test',
  anova: 'one-way ANOVA',
  regression: 'linear regression',
  correlation: 'correlation (Pearson\'s r)',
};

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  categorical: 'a category (a label such as yes or no, or a channel type)',
  numeric: 'a number (a count, a length, a score)',
};

export const COMPARISON_LABEL: Record<ComparisonKind, string> = {
  'categorical-two-groups': 'a category with two groups',
  'categorical-three-plus-groups': 'a category with three or more groups',
  numeric: 'a number',
};

export interface TestVerdict {
  /** True when the chosen test fits the variables. */
  fits: boolean;
  /** The tests that fit these variables (what "suggest" mode names). */
  fitting: TestId[];
  /** One or two plain sentences: why it fits, or what does not match. */
  reason: string;
}

/** The tests that fit an outcome compared across, or predicted from, another variable. */
export function fittingTests(outcome: OutcomeKind, comparison: ComparisonKind): TestId[] {
  if (outcome === 'categorical') {
    // Two categories: whether they go together. A number explaining a category is beyond these courses.
    return comparison === 'numeric' ? [] : ['chi-square'];
  }
  if (comparison === 'categorical-two-groups') return ['t-test'];
  if (comparison === 'categorical-three-plus-groups') return ['anova'];
  return ['regression', 'correlation'];
}

/** Check the student's choice. Never picks for them: the verdict is about the choice given. */
export function checkTestChoice(outcome: OutcomeKind, comparison: ComparisonKind, chosen: TestId): TestVerdict {
  const fitting = fittingTests(outcome, comparison);
  // The key sentence comes first: a notification shows only its first line until it is expanded
  const vars = `You have ${OUTCOME_LABEL[outcome].split(' (')[0]} compared across ${COMPARISON_LABEL[comparison]}.`;
  if (fitting.length === 0) {
    return {
      fits: false,
      fitting,
      reason: `None of the course's tests fits these variables. ${vars} Check that the outcome is the variable you are explaining; if the category is the outcome and the number explains it, ask your instructor.`,
    };
  }
  if (fitting.includes(chosen)) {
    return { fits: true, fitting, reason: `${WHY[chosen]} ${vars}` };
  }
  return { fits: false, fitting, reason: `${NEEDS[chosen]} ${vars}` };
}

// Why a test fits, in the courses' words
const WHY: Record<TestId, string> = {
  'chi-square': 'A chi-square test asks whether two categories go together, from the counts in each combination.',
  't-test': 'A Welch t-test compares the mean of a number between two groups, without assuming the groups spread out equally.',
  anova: 'A one-way ANOVA compares the mean of a number across three or more groups at once.',
  regression: 'A linear regression asks how much the outcome changes for each one-unit change in the predictor.',
  correlation: 'A correlation asks whether two numbers move together, and how strongly.',
};

// What each test needs, to explain a mismatch without naming the right answer
const NEEDS: Record<TestId, string> = {
  'chi-square': 'A chi-square test needs two categories.',
  't-test': 'A t-test needs a number for the outcome and a category with exactly two groups.',
  anova: 'A one-way ANOVA needs a number for the outcome and a category with three or more groups.',
  regression: 'A linear regression, as these courses use it, needs a number for the outcome and a number as the predictor.',
  correlation: 'A correlation needs two numbers.',
};
