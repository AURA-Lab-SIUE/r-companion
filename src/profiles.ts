// Course profiles: what each course needs installed.
//
// Sources, read 2026-10-18 (keep this list in step with them):
// - MC 427: Field Guide C2, Tools Stack Setup (A03), the Windows and Mac setup guides, and the
//   AURA-Lab-SIUE/mc427-codespace Dockerfile and mc427-setup-check.R (R >= 4.2, tidyverse, effectsize).
// - MC 451 and MC 501: v2v-hub resources/install-r.qmd (Steps 3 and 4), resources/install-v2v.qmd
//   (remotes, then v2v from GitHub), and v2v-r R/setup.R (the toolchain v2v::setup() checks).
// No network access and no VS Code API here, so the unit tests can load this file directly.

export type CourseId = 'mc427' | 'mc451' | 'mc501';

export interface PackageSpec {
  /** The package name as library() takes it. */
  name: string;
  /** Plain-English reason shown next to the package in the checklist. */
  why: string;
  /** Required packages make the setup fail when missing; recommended ones only warn. */
  level: 'required' | 'recommended';
  /** Where it installs from. GitHub packages need remotes first; local is a source folder on disk. */
  source: 'cran' | 'github' | 'local';
  /** owner/repo for GitHub packages. */
  repo?: string;
  /** The source folder for a local package (sess, from the R extension's own folder). */
  path?: string;
  /** Lowest version the course expects, if any. */
  minVersion?: string;
}

export interface CourseProfile {
  id: CourseId;
  label: string;
  /** The course number alone, for messages that must fit a notification on one line. */
  short: string;
  minR: string;
  packages: PackageSpec[];
  needsQuarto: boolean;
  needsGit: boolean;
  /** True when v2v::setup() exists for this course and should be shown as a checklist. */
  runV2vSetup: boolean;
  /** A course setup script students run by name, if the course has one. */
  setupScript?: string;
  /** Exact result lines, when a course grades the wording (MC 427 Tools Stack Setup, decision U5). */
  resultLines?: { ok: string; notReady: string };
  /** The Copilot instructions file this course's workspace gets (resources/course-files). */
  copilotInstructions: string;
  workspace: { label: string; url: string; guideLabel: string; guideUrl: string };
  help: { label: string; url: string }[];
}

const HUB = 'https://aura-lab.siue.edu/v2v-hub';

const V2V_PACKAGES: PackageSpec[] = [
  { name: 'tidyverse', why: 'ggplot2, dplyr, readr, tidyr, and more', level: 'required', source: 'cran' },
  { name: 'janitor', why: 'clean_names(), used from the first wrangling practice on', level: 'required', source: 'cran' },
  { name: 'likert', why: 'Likert-scale survey analysis', level: 'required', source: 'cran' },
  { name: 'rmarkdown', why: 'reports from your analysis', level: 'required', source: 'cran' },
  { name: 'languageserver', why: 'code completion and help in VS Code', level: 'required', source: 'cran' },
  { name: 'httpgd', why: 'plots render in a VS Code panel', level: 'required', source: 'cran' },
  { name: 'remotes', why: 'installs the course package from GitHub', level: 'required', source: 'cran' },
  {
    name: 'v2v',
    why: 'the course package (datasets, reliability, tests, theme)',
    level: 'required',
    source: 'github',
    repo: 'AURA-Lab-SIUE/v2v-r',
    // 0.3.3 from R2 on (owner q-20261018-0047 = A): its join_chat_streams() returns ts and
    // snapshot_ts, which the generated wrangling code reads. 0.3.6 since the portfolio unit:
    // before it, v2v::deploy_portfolio() published to Posit Connect and every deploy ended in
    // "Publish failed:", while Check my setup still said OK.
    minVersion: '0.3.6',
  },
  { name: 'quarto', why: 'the R side of Quarto, used to publish your portfolio', level: 'recommended', source: 'cran' },
];

export const PROFILES: Record<CourseId, CourseProfile> = {
  mc427: {
    id: 'mc427',
    label: 'MC 427 Social Media Analytics',
    short: 'MC 427',
    minR: '4.2.0',
    packages: [
      { name: 'tidyverse', why: 'every course script starts with it', level: 'required', source: 'cran' },
      { name: 'effectsize', why: 'the effect sizes in your Module 5 memo', level: 'required', source: 'cran' },
    ],
    needsQuarto: false,
    needsGit: true,
    runV2vSetup: false,
    setupScript: 'mc427-setup-check.R',
    // Must match the line mc427-setup-check.R prints, character for character: it is graded
    resultLines: {
      ok: 'SETUP OK: R and the course packages are working.',
      notReady: 'SETUP NOT READY: fix the item(s) marked MISSING above.',
    },
    copilotInstructions: 'copilot-instructions-mc427.md',
    workspace: {
      label: 'Your MC427 copy of the course folder',
      url: 'https://github.com/AURA-Lab-SIUE/mc427-codespace',
      guideLabel: 'GitHub Account and Copilot Student, Parts 6 and 7 (Blackboard, Start Here)',
      guideUrl: 'https://github.com/AURA-Lab-SIUE/mc427-codespace',
    },
    help: [
      { label: 'MC 427 course folder template on GitHub', url: 'https://github.com/AURA-Lab-SIUE/mc427-codespace' },
      { label: 'Install R (the course hub guide)', url: `${HUB}/resources/install-r.html` },
    ],
  },
  mc451: {
    id: 'mc451',
    label: 'MC 451 Research Methods',
    short: 'MC 451',
    minR: '4.2.0',
    packages: [
      ...V2V_PACKAGES,
      // The plain t-test and chi-square the Test menu writes (owner q-20261018-0044 = A) call it,
      // so it is required from 0.4.0 on
      { name: 'effectsize', why: "Cohen's d and Cramer's V in the tests (Inferencing Data)", level: 'required', source: 'cran' },
    ],
    copilotInstructions: 'copilot-instructions-v2v.md',
    needsQuarto: true,
    needsGit: true,
    runV2vSetup: true,
    workspace: {
      label: 'Your copy of the v2v-workspace template',
      url: 'https://github.com/AURA-Lab-SIUE/v2v-workspace',
      guideLabel: 'Getting Started, Steps 1 and 4',
      guideUrl: `${HUB}/setup.html`,
    },
    help: [
      { label: 'Fix It: the problems the class has hit', url: `${HUB}/resources/fix-it.html` },
      { label: 'Install R for VS Code', url: `${HUB}/resources/install-r.html` },
      { label: 'Installing the v2v package', url: `${HUB}/resources/install-v2v.html` },
      { label: 'Install Quarto', url: `${HUB}/resources/install-quarto.html` },
      { label: 'Getting Started with GitHub', url: `${HUB}/resources/github-setup.html` },
    ],
  },
  mc501: {
    id: 'mc501',
    label: 'MC 501 Research Methods (graduate)',
    short: 'MC 501',
    minR: '4.2.0',
    packages: [
      ...V2V_PACKAGES,
      // Required from 0.4.0 on: the plain tests the Test menu writes call it
      { name: 'effectsize', why: 'confidence intervals on effect sizes (Inferencing Data)', level: 'required', source: 'cran' },
      // The regression block's standardized slope calls lm.beta::lm.beta() (owner q-20261019-0009 = install)
      { name: 'lm.beta', why: 'the standardized slope in the regression (Inferencing Data)', level: 'required', source: 'cran' },
      // w05 power analysis: the Power analysis menu writes pwr.t.test(), so it is required from 0.5.0 on
      { name: 'pwr', why: 'power analysis for your sample size', level: 'required', source: 'cran' },
      { name: 'renv', why: 'records the package versions your project used', level: 'recommended', source: 'cran' },
    ],
    copilotInstructions: 'copilot-instructions-v2v.md',
    needsQuarto: true,
    needsGit: true,
    runV2vSetup: true,
    workspace: {
      label: 'Your copy of the v2v-workspace template',
      url: 'https://github.com/AURA-Lab-SIUE/v2v-workspace',
      guideLabel: 'Getting Started, Steps 1 and 4',
      guideUrl: `${HUB}/setup.html`,
    },
    help: [
      { label: 'Fix It: the problems the class has hit', url: `${HUB}/resources/fix-it.html` },
      { label: 'Install R for VS Code', url: `${HUB}/resources/install-r.html` },
      { label: 'Installing the v2v package', url: `${HUB}/resources/install-v2v.html` },
      { label: 'Install Quarto', url: `${HUB}/resources/install-quarto.html` },
      { label: 'Getting Started with GitHub', url: `${HUB}/resources/github-setup.html` },
    ],
  },
};

export const COURSE_IDS: CourseId[] = ['mc427', 'mc451', 'mc501'];

export function isCourseId(x: unknown): x is CourseId {
  return typeof x === 'string' && (COURSE_IDS as string[]).includes(x);
}

/** Compares dotted version strings numerically ("4.10.0" > "4.9.1"). Returns -1, 0, or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((s) => parseInt(s, 10) || 0);
  const pb = b.split(/[.-]/).map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Every package name the probe should look up for this course. */
export function packageNames(profile: CourseProfile): string[] {
  return profile.packages.map((p) => p.name);
}

/** The notification after Pick my course. Short enough to show whole (the full label was cut off on leith-hp). */
export function courseSetMessage(profile: CourseProfile): string {
  return `Course set to ${profile.short}. Next: Check my setup.`;
}
