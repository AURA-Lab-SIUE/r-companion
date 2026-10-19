// Course files for a workspace a student already made from a template (decision U9).
//
// A repository made from a GitHub template is an independent copy, so files added to the
// template later never reach it. This adds two of them to the open folder:
//   .github/copilot-instructions.md   (only when absent: never overwrites the student's file)
//   .vscode/extensions.json            (adds this extension to "recommendations", keeping the rest)
// Pure: no VS Code API, so the unit tests run it on plain strings.

export const SELF_ID = 'aura-lab-siue.r-companion';

export type MergeResult =
  | { status: 'created'; text: string }
  | { status: 'added'; text: string }
  | { status: 'already'; text: string }
  | { status: 'unreadable'; reason: string };

/** Adds SELF_ID to the recommendations in an extensions.json, or creates one. */
export function mergeRecommendations(existing: string | undefined, extra: string[] = []): MergeResult {
  const wanted = [SELF_ID, ...extra];
  if (existing === undefined || existing.trim() === '') {
    return { status: 'created', text: JSON.stringify({ recommendations: wanted }, null, 2) + '\n' };
  }
  // Comments or trailing commas: leave the student's file alone and say so
  let parsed: any;
  try {
    parsed = JSON.parse(existing);
  } catch {
    return { status: 'unreadable', reason: 'the file has comments or is not plain JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { status: 'unreadable', reason: 'the file is not a JSON object' };
  }
  const recs: unknown = parsed.recommendations ?? [];
  if (!Array.isArray(recs)) return { status: 'unreadable', reason: '"recommendations" is not a list' };
  const lower = recs.map((r) => String(r).toLowerCase());
  const missing = wanted.filter((w) => !lower.includes(w.toLowerCase()));
  if (missing.length === 0) return { status: 'already', text: existing };
  parsed.recommendations = [...recs, ...missing];
  return { status: 'added', text: JSON.stringify(parsed, null, 2) + '\n' };
}
