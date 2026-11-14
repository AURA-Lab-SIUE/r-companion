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
  // clean_names() piped onto the read (the Companion's own import writes it on the next line), or
  // run later as its own step (`coded <- coded %>% clean_names()`, guide 08), renames the columns,
  // so the probe reads the cleaned names the generated code will use (walk 2026-11-13, G12).
  for (const name of cleanedNames(codeAbove)) {
    const src = out.get(name);
    if (src && !src.startsWith('janitor::clean_names(')) out.set(name, `janitor::clean_names(${src})`);
  }
  return out;
}

/** Tables whose column names clean_names() rewrites, by a read piped into it or a later step. */
export function cleanedNames(codeAbove: string): Set<string> {
  const names = new Set<string>();
  const pipe = String.raw`(?:%>%|\|>)\s*(?:janitor::)?clean_names\(\)`;
  const name = String.raw`([A-Za-z][A-Za-z0-9._]*)`;
  const onRead = new RegExp(
    String.raw`^[ \t]*${name}[ \t]*<-[ \t]*(?:readr::)?(?:read_csv|readxl::read_excel|read_excel)\("[^"]+"(?:,\s*sheet\s*=\s*"[^"]+")?\)\s*${pipe}`,
    'gm',
  );
  for (const m of codeAbove.matchAll(onRead)) names.add(m[1]);
  const later = new RegExp(String.raw`^[ \t]*${name}[ \t]*<-[ \t]*${name}\s*${pipe}`, 'gm');
  for (const m of codeAbove.matchAll(later)) if (m[1] === m[2]) names.add(m[1]);
  return names;
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

// ---------------- Save tables: RDS picker and RData (0.7.5, A2) ----------------

/** Save tasks that ask which table to save (MC 451 and MC 501). */
export const SAVE_PICK_TASKS = new Set(['export-rds', 'save-rdata']);

/** RData blocks make the tables they load, so Run it records those names (filled by the menu). */
export const RDATA_TASKS = new Set(['save-rdata', 'load-rdata']);

/**
 * The tables a save may offer, the course default first: the tables the script assigns above the
 * cursor and the ones a run menu block made. The default stays the first item, so pressing Enter
 * keeps the block the 0.7.4 menu wrote.
 */
export function saveChoices(has: Iterable<string>, courseDefault: string): string[] {
  const names = [...new Set(has)].filter((n) => n !== courseDefault);
  return [courseDefault, ...names];
}

/** The default RDS file for a table: the course file for the course default, else data/<name>.RDS. */
export function rdsFileFor(table: string, courseDefault: string, courseFile: string): string {
  return table === courseDefault ? courseFile : `data/${table}.RDS`;
}

/** A table name R accepts without backticks; anything else is not offered as a save choice. */
export function plainName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9._]*$/.test(name) && !RESERVED.has(name);
}

const RESERVED = new Set(['if', 'else', 'repeat', 'while', 'function', 'for', 'in', 'next', 'break', 'TRUE', 'FALSE', 'NULL', 'Inf', 'NaN', 'NA']);

// ---------------- Run it: a table the session may not have (0.7.5, G16) ----------------

/**
 * The tables a block uses that nothing has made yet: names from `known` (the course tables and the
 * tables the script assigns) that appear in the block's code, outside comments and quoted text,
 * before the block assigns them itself, and that no run menu block made in this window. Lines the
 * student ran by hand are invisible here, so the caller words this as "may not have".
 */
export function tablesNotMade(code: string, known: Iterable<string>, made: Set<string>): string[] {
  const knownSet = new Set(known);
  const assigned = new Set<string>();
  const out: string[] = [];
  for (const raw of code.split(/\r?\n/)) {
    const line = raw.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/#.*$/, '');
    const lhs = line.match(/^[ \t]*([A-Za-z][A-Za-z0-9._]*)[ \t]*<-/);
    const rhs = lhs ? line.slice(lhs[0].length) : line;
    for (const m of rhs.matchAll(/(?<![A-Za-z0-9._$@:])([A-Za-z][A-Za-z0-9._]*)(?![A-Za-z0-9._]*\s*(?:=(?!=)|\())/g)) {
      const n = m[1];
      if (knownSet.has(n) && !assigned.has(n) && !made.has(n) && !out.includes(n)) out.push(n);
    }
    if (lhs) assigned.add(lhs[1]);
  }
  return out;
}

/** The tables every MC 451 and MC 501 menu block may read. */
export const COURSE_TABLES = ['chat', 'streams', 'analysis', 'chat_streams'];
