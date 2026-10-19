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
