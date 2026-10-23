// Which data frame a Data menu reads (MC 451 and MC 501, #rgui).
//
// Count, filter, and select read a table the student already has. The menu offers chat, which
// Load the course Twitch corpus makes, and adds analysis or chat_streams only once the script
// assigns them above the cursor or a menu block that makes them has been run in this window. A
// block that reads a table nothing has made fails with "object not found" (R2 card step 7,
// 2026-10-19: count read analysis right after Load the course Twitch corpus). No VS Code API here,
// so the unit tests load this file directly.

/** The menu blocks that make each table when the student runs them. */
export const MAKES: Record<string, string[]> = {
  'import-course-dataset': ['chat', 'streams'],
  'import-rds': ['analysis'],
  'join-chat-streams': ['chat_streams'],
};

export interface TableChoice {
  /** The data frame's name in R. */
  name: string;
  /** Where it comes from, in the student's words. */
  detail: string;
  /** The column the course default groups or keeps, when the course has one for this table. */
  defaultColumn?: string;
  /** True when the template's own defaults (the golden block) already read this table. */
  templateDefault: boolean;
  // A table with neither templateDefault nor defaultColumn has no course default: its column
  // comes from the column probe, or the menu writes nothing.
  /** An R expression the column probe can read without the student's session, if any. */
  probe?: string;
}

const DETAIL: Record<string, string> = {
  chat: 'the chat messages, from Load the course Twitch corpus',
  analysis: 'your saved analysis, from Load your saved analysis (RDS)',
  chat_streams: 'the messages matched to their streams',
};

/** The tasks this choice applies to. */
export const TABLE_TASKS = new Set(['count', 'filter', 'select']);

/** Names assigned with <- at the start of a line, in the code above the cursor. */
export function assignedNames(codeAbove: string): Set<string> {
  const names = new Set<string>();
  for (const m of codeAbove.matchAll(/^[ \t]*([A-Za-z][A-Za-z0-9._]*)[ \t]*<-/gm)) names.add(m[1]);
  return names;
}

/**
 * The tables a task may read, the default first. chat is always offered (the menu lists Load the
 * course Twitch corpus first); analysis and chat_streams only when `has` holds them. Count's
 * default is chat; filter and select keep the course pages' analysis as the default once it exists.
 */
export function tableChoices(task: string, has: Set<string>, analysisFile?: string): TableChoice[] {
  const chat: TableChoice = {
    name: 'chat',
    detail: DETAIL.chat,
    defaultColumn: task === 'count' ? 'channel' : undefined,
    templateDefault: task === 'count',
    probe: 'v2v::twitch_chat()',
  };
  const analysis: TableChoice = {
    name: 'analysis',
    detail: DETAIL.analysis,
    defaultColumn: task === 'count' ? 'channel_type' : undefined,
    templateDefault: task !== 'count',
    probe: analysisFile ? `readRDS(${JSON.stringify(analysisFile)})` : undefined,
  };
  const chatStreams: TableChoice = {
    name: 'chat_streams',
    detail: DETAIL.chat_streams,
    defaultColumn: task === 'count' ? 'game' : undefined,
    templateDefault: false,
  };
  const out: TableChoice[] = [];
  if (task !== 'count' && has.has('analysis')) out.push(analysis);
  out.push(chat);
  if (has.has('chat_streams')) out.push(chatStreams);
  if (task === 'count' && has.has('analysis')) out.push(analysis);
  return out;
}

// ---------------- Join two tables (0.5.3) ----------------

/** Tables the course corpus makes, with the R that reads each without the student's session. */
const COURSE_SOURCES: Record<string, string> = {
  chat: 'v2v::twitch_chat()',
  streams: 'v2v::twitch_streams()',
};

/**
 * Where each table assigned in the code above the cursor comes from, when R can read it again
 * without the student's session: a read_csv(), read_excel(), or read_rds() of a file, or the
 * course corpus. Relative paths are made absolute against `folder` so the probe finds the file.
 * A table built from other tables (a join, a filter) has no entry: its columns are not knowable
 * without running the script.
 */
export function tableSources(codeAbove: string, folder?: string): Map<string, string> {
  const out = new Map<string, string>();
  const abs = (p: string) => (folder && !/^([A-Za-z]:)?[\\/]/.test(p) ? `${folder.replace(/\\/g, '/')}/${p}` : p);
  const read = /^[ \t]*([A-Za-z][A-Za-z0-9._]*)[ \t]*<-[ \t]*(readr::)?(read_csv|read_rds|readRDS|readxl::read_excel)\("([^"]+)"(?:,\s*sheet\s*=\s*"([^"]+)")?\)/gm;
  for (const m of codeAbove.matchAll(read)) {
    const [, name, , fn, file, sheet] = m;
    const p = JSON.stringify(abs(file));
    out.set(
      name,
      fn === 'read_csv'
        ? `readr::read_csv(${p}, show_col_types = FALSE)`
        : fn === 'readxl::read_excel'
          ? `readxl::read_excel(${p}${sheet ? `, sheet = ${JSON.stringify(sheet)}` : ''})`
          : `readRDS(${p})`,
    );
  }
  for (const m of codeAbove.matchAll(/^[ \t]*(chat|streams)[ \t]*<-[ \t]*(v2v::)?twitch_(chat|streams)\(\)/gm)) {
    out.set(m[1], COURSE_SOURCES[m[1]]);
  }
  return out;
}

/** Column names both tables have, in the left table's order: the keys a join can use. */
export function sharedColumns(left: string[], right: string[]): string[] {
  const r = new Set(right);
  return left.filter((c) => r.has(c));
}

/** A warning when the key repeats in the right-hand table, so the join would add rows. */
export function repeatWarning(key: string, right: string, distinct: number, rows: number): string | undefined {
  if (distinct >= rows) return undefined;
  const repeats = rows - distinct;
  return `${key} repeats in ${right} (${repeats} of ${rows} rows share a value with another row), so the join will add rows. If each ${key} should appear once, count it first.`;
}
