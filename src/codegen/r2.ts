// R2 Data, wrangling, and the reliability grid: code templates (workstream E, #rgui).
// Each function reproduces its golden fixture byte for byte when called with no overrides.

import { lines, banner } from './house';
import { GenParams, Template } from './types';

const d = (p: GenParams, def: string) => p.data ?? def;
/** A filter value as R reads it: quoted text, or TRUE, FALSE, and numbers as they are. */
const shown = (p: GenParams, value: string) => (p.rawValue ? value : `"${value}"`);

// ---------------- MC 427 (plain tidyverse) ----------------

const mc427ImportCsv: Template = (p) => {
  const name = d(p, 'df');
  const file = p.file ?? 'mod05-E01-practice-tweets.csv';
  return lines(
    banner('Load the tidyverse and your data file'),
    '# Load the tidyverse once, at the top of the script. It prints a list of',
    '# packages with check marks and two "masks" lines; both are normal.',
    'library(tidyverse)',
    '',
    `# Read the file and name it ${name}. Prints a report: rows, columns, and each column's type.`,
    `${name} <- read_csv("${file}")`,
    '',
    '# Look at every column: its name, its type, and its first values.',
    `glimpse(${name})`,
  );
};

const mc427Filter: Template = (p) => {
  const data = d(p, 'df');
  const result = p.result ?? 'next_posts';
  const column = p.column ?? 'update';
  const value = p.value ?? 'NEXT';
  return lines(
    banner('Keep the rows you want: filter()'),
    `# Keep the posts where ${column} is ${shown(p, value)} and name the result ${result}.`,
    p.rawValue ? '# TRUE, FALSE, and numbers go without quotation marks. This line prints nothing.' : '# Text values go in quotation marks. This line prints nothing.',
    `${result} <- ${data} %>%`,
    `  filter(${column} == ${shown(p, value)})`,
    '',
    '# Count the rows that are left.',
    `nrow(${result})`,
  );
};

const mc427Select: Template = (p) => {
  const data = d(p, 'df');
  const cols = (p.columns ?? ['update', 'posted_from', 'like_count']).join(', ');
  return lines(
    banner('Keep the columns you want: select()'),
    '# Keep three columns, then look at them. The rows are all still there.',
    `${data} %>%`,
    `  select(${cols}) %>%`,
    '  glimpse()',
  );
};

const mc427Mutate: Template = (p) => {
  const data = d(p, 'df');
  return lines(
    banner('Add a new column: mutate()'),
    '# Add log_likes, the log of one plus like_count. log1p() keeps a zero at zero,',
    '# where log() would turn it into -Inf. This line changes df and prints nothing.',
    `${data} <- ${data} %>%`,
    '  mutate(log_likes = log1p(like_count))',
    '',
    '# Check the new column beside the one it came from, in the first three rows.',
    `${data} %>%`,
    '  select(like_count, log_likes) %>%',
    '  slice_head(n = 3)',
  );
};

const mc427Count: Template = (p) => {
  const data = d(p, 'df');
  const column = p.column ?? 'posted_from';
  return lines(
    banner('Count the rows in each group: count()'),
    `# One row per value of ${column}, largest first. The n column adds up to the rows in ${data}.`,
    `${data} %>%`,
    `  count(${column}, sort = TRUE)`,
  );
};

const mc427ExportCsv: Template = (p) => {
  const data = d(p, 'next_posts');
  const file = p.file ?? 'next-posts.csv';
  return lines(
    banner('Save a table as a CSV file: write_csv()'),
    `# Save ${data} to a file in your course folder. Prints nothing.`,
    `write_csv(${data}, "${file}")`,
    '',
    '# Read the saved file back and count its rows, to confirm the save worked.',
    `read_csv("${file}") %>%`,
    '  nrow()',
  );
};

const mc427ExportRds: Template = (p) => {
  const data = d(p, 'df');
  const file = p.file ?? 'practice-tweets.RDS';
  return lines(
    banner('Save a table as an RDS file: write_rds()'),
    '# An RDS file keeps every column type exactly, so the next script loads the same table.',
    '# Prints nothing.',
    `write_rds(${data}, "${file}")`,
    '',
    '# Read the saved file back and count its rows, to confirm the save worked.',
    `read_rds("${file}") %>%`,
    '  nrow()',
  );
};

// ---------------- v2v (MC 451 / MC 501) ----------------

const v2vImportCsv: Template = (p) => {
  const name = d(p, 'pilot');
  const file = p.file ?? 'data/reliability-pilot.csv';
  return lines(
    banner('Load the tidyverse, the course package, and a CSV file'),
    'library(tidyverse)',
    'library(v2v)',
    '',
    `# Read the file and name it ${name}. Prints a report: rows, columns, and each column's type.`,
    `${name} <- read_csv("${file}")`,
    '',
    '# Look at every column: its name, its type, and its first values.',
    `glimpse(${name})`,
  );
};

const v2vImportCourseDataset: Template = () =>
  lines(
    banner('Load the tidyverse, the course package, and the course data'),
    '# Load both packages once, at the top of the script.',
    'library(tidyverse)',
    'library(v2v)',
    '',
    '# The course corpus: one row per chat message, and one row per stream snapshot.',
    '# These lines print nothing.',
    'chat <- twitch_chat()',
    'streams <- twitch_streams()',
    '',
    '# Look at every column of each: its name, its type, and its first values.',
    'glimpse(chat)',
    'glimpse(streams)',
  );

const v2vImportRds: Template = (p) => {
  const name = d(p, 'analysis');
  const file = p.file ?? 'data/twitch_analysis.RDS';
  return lines(
    banner('Load the tidyverse, the course package, and your saved analysis file'),
    'library(tidyverse)',
    'library(v2v)',
    '',
    `# Read the RDS file you saved in the wrangling step and name it ${name}. Prints nothing.`,
    `${name} <- read_rds("${file}")`,
    '',
    '# Look at every column: its name, its type, and its first values.',
    `glimpse(${name})`,
  );
};

const v2vFilter: Template = (p) => {
  const data = d(p, 'analysis');
  const result = p.result ?? 'gaming';
  const column = p.column ?? 'channel_type';
  const value = p.value ?? 'gaming';
  const what =
    column === 'channel_type' && value === 'gaming'
      ? 'the messages from gaming channels'
      : `the rows where ${column} is ${shown(p, value)}`;
  return lines(
    banner('Keep the rows you want: filter()'),
    `# Keep ${what} and name the result ${result}.`,
    p.rawValue ? '# TRUE, FALSE, and numbers go without quotation marks. This line prints nothing.' : '# Text values go in quotation marks. This line prints nothing.',
    `${result} <- ${data} %>%`,
    `  filter(${column} == ${shown(p, value)})`,
    '',
    '# Count the rows that are left.',
    `nrow(${result})`,
  );
};

const v2vSelect: Template = (p) => {
  const data = d(p, 'analysis');
  const cols = (p.columns ?? ['channel', 'channel_type', 'message_length']).join(', ');
  return lines(
    banner('Keep the columns you want: select()'),
    '# Keep three columns, then look at them. The rows are all still there.',
    `${data} %>%`,
    `  select(${cols}) %>%`,
    '  glimpse()',
  );
};

const v2vMutate: Template = (p) => {
  const data = d(p, 'chat');
  return lines(
    banner('Add a new column: mutate()'),
    '# Add message_length, the number of characters in each message. Changes chat; prints nothing.',
    `${data} <- ${data} %>%`,
    '  mutate(message_length = str_length(message))',
    '',
    '# Check the new column beside the one it came from, in the first three rows.',
    `${data} %>%`,
    '  select(message, message_length) %>%',
    '  slice_head(n = 3)',
  );
};

// Count reads chat, the table Load the course Twitch corpus makes, so it runs in the order the
// menu lists it (R2 card step 7, 2026-10-19). The menu offers analysis once that table exists.
const v2vCount: Template = (p) => {
  const data = d(p, 'chat');
  const column = p.column ?? 'channel';
  return lines(
    banner('Count the rows in each group: count()'),
    `# One row per value of ${column}, largest first. The n column adds up to the rows in ${data}.`,
    `${data} %>%`,
    `  count(${column}, sort = TRUE)`,
  );
};

const v2vCleanDates: Template = () =>
  lines(
    banner('Turn the date column into a readable time: clean_dates()'),
    '# date counts milliseconds since midnight, January 1, 1970 (UTC). clean_dates() divides by',
    '# 1,000 and turns the result into a date and time. The same step without v2v:',
    '# mutate(ts = as_datetime(date / 1000)), with as_datetime() from lubridate (in the tidyverse).',
    '# These lines change chat and streams and print nothing.',
    'chat <- chat %>%',
    '  mutate(ts = clean_dates(date))',
    'streams <- streams %>%',
    '  mutate(ts = clean_dates(date))',
    '',
    '# Check the new column beside the one it came from, in the first three rows.',
    'chat %>%',
    '  select(date, ts) %>%',
    '  slice_head(n = 3)',
  );

// join_chat_streams(): v2v 0.3.3, which the courses require from R2 on, returns the two times as
// ts and snapshot_ts itself, so the rename() line 0.3.2 needed is gone (on 0.3.3 that line errors:
// column ts.x does not exist).
const v2vJoinChatStreams: Template = () =>
  lines(
    banner('Match each message to its stream: join_chat_streams()'),
    '# Attaches the game and viewer count of the latest stream snapshot taken at or before each',
    '# message, on the same channel. Both tables need the ts column from clean_dates(). The same',
    '# join without v2v: left_join(chat, streams, by = join_by(channel, closest(ts >= ts))).',
    '# The message keeps its time as ts, and the snapshot time comes back as snapshot_ts.',
    '# Prints nothing.',
    'chat_streams <- join_chat_streams(chat, streams)',
    '',
    '# Count the messages that found a snapshot (FALSE) and those that did not (TRUE).',
    'chat_streams %>%',
    '  count(no_snapshot = is.na(viewers))',
  );

const v2vChannelLookup: Template = () =>
  lines(
    banner('Label each channel by the category it streams most'),
    "# Count each channel's snapshots in each category, then keep its most frequent category.",
    '# Snapshots with no category are dropped first. Prints nothing.',
    'channel_type <- streams %>%',
    '  filter(!is.na(game)) %>%',
    '  count(channel, game) %>%',
    '  group_by(channel) %>%',
    '  slice_max(n, n = 1, with_ties = FALSE) %>%',
    '  ungroup()',
    '',
    '# The categories that are not games.',
    'nongaming_categories <- c(',
    '  "Art", "ASMR", "Beauty & Body Art", "Creative", "Food & Drink",',
    '  "IRL", "Just Chatting", "Makers & Crafting", "Music",',
    '  "Music & Performing Arts", "Science & Technology",',
    '  "Sports & Fitness", "Talk Shows & Podcasts", "Travel & Outdoors"',
    ')',
    '',
    "# is_gaming is TRUE when a channel's main category is not on that list. main_game keeps the",
    "# category itself, under a name that does not clash with the snapshot's game. Prints nothing.",
    'channel_type <- channel_type %>%',
    '  mutate(is_gaming = !(game %in% nongaming_categories)) %>%',
    '  select(channel, main_game = game, is_gaming)',
    '',
    '# One row per channel that has a category.',
    'nrow(channel_type)',
  );

const v2vJoinLookup: Template = () =>
  lines(
    banner('Join the channel labels onto every message: left_join()'),
    '# Keeps every message and adds main_game and is_gaming from the row with the same channel,',
    '# the join key. A message whose channel has no label gets NA. Changes chat_streams; prints nothing.',
    'chat_streams <- chat_streams %>%',
    '  left_join(channel_type, by = "channel")',
    '',
    '# Check the join: messages from gaming channels (TRUE), the others (FALSE), and unlabeled (NA).',
    'chat_streams %>%',
    '  count(is_gaming)',
  );

const v2vConvertTimestamp: Template = () =>
  lines(
    banner('Turn the date column into a readable time'),
    '# date counts milliseconds since midnight, January 1, 1970 (UTC). Divide by 1,000 to get',
    '# seconds, then as.POSIXct() turns the seconds into a date and time. Changes chat; prints nothing.',
    'chat <- chat %>%',
    '  mutate(timestamp = as.POSIXct(date / 1000, origin = "1970-01-01", tz = "UTC"))',
    '',
    '# Check the new column beside the one it came from, in the first three rows.',
    'chat %>%',
    '  select(date, timestamp) %>%',
    '  slice_head(n = 3)',
  );

const v2vLabelFromSnapshot: Template = () =>
  lines(
    banner('Label each message from its stream snapshot'),
    '# The categories that are not games.',
    'nongaming_categories <- c(',
    '  "Art", "ASMR", "Beauty & Body Art", "Creative", "Food & Drink",',
    '  "IRL", "Just Chatting", "Makers & Crafting", "Music",',
    '  "Music & Performing Arts", "Science & Technology",',
    '  "Sports & Fitness", "Talk Shows & Podcasts", "Travel & Outdoors"',
    ')',
    '',
    '# The per-moment alternative: is_gaming is TRUE when the stream\'s category AT THAT MOMENT is a',
    '# game, NA when none was recorded, and viewer_band is that moment\'s audience in three bands.',
    '# It answers a different question from the channel label, and changes every later result.',
    '# Changes chat_streams; prints nothing.',
    'chat_streams <- chat_streams %>%',
    '  mutate(',
    '    is_gaming = if_else(is.na(game), NA, !(game %in% nongaming_categories)),',
    '    channel_type = factor(if_else(is_gaming, "gaming", "non-gaming")),',
    '    viewer_band = cut(viewers, breaks = c(0, 5000, 20000, Inf),',
    '                      labels = c("small", "medium", "large"))',
    '  )',
    '',
    '# Check the labels: gaming (TRUE), not gaming (FALSE), and unlabeled (NA).',
    'chat_streams %>%',
    '  count(is_gaming)',
    '',
    '# And the bands.',
    'chat_streams %>%',
    '  count(viewer_band)',
  );

const v2vExportCsv: Template = (p) => {
  const data = d(p, 'gaming');
  const file = p.file ?? 'data/gaming-messages.csv';
  return lines(
    banner('Save a table as a CSV file: write_csv()'),
    `# Save ${data} to a file in your data folder. Prints nothing.`,
    `write_csv(${data}, "${file}")`,
    '',
    '# Read the saved file back and count its rows, to confirm the save worked.',
    `read_csv("${file}") %>%`,
    '  nrow()',
  );
};

const v2vExportRds: Template = (p) => {
  const data = d(p, 'analysis');
  const file = p.file ?? 'data/twitch_analysis.RDS';
  return lines(
    banner('Save a table as an RDS file: write_rds()'),
    '# An RDS file keeps every column type exactly, so the next script loads the same table.',
    '# Prints nothing.',
    `write_rds(${data}, "${file}")`,
    '',
    '# Read the saved file back and count its rows, to confirm the save worked.',
    `read_rds("${file}") %>%`,
    '  nrow()',
  );
};

// Reliability: the v2v wrapper by default; the plain irr calls under plainCalls (q-20261018-0044).
const v2vReliability: Template = (p, opts) => {
  const data = d(p, 'pilot');
  const a = p.columns?.[0] ?? 'pass_1';
  const b = p.columns?.[1] ?? 'pass_2';
  if (opts.plainCalls) return v2vReliabilityPlain(p, opts);
  return lines(
    banner('Reliability: compare your two coding passes'),
    '# The share of items where pass 1 and pass 2 gave the same code.',
    `${data} %>%`,
    '  summarize(',
    '    items = n(),',
    `    share_agree = mean(${a} == ${b})`,
    '  )',
    '',
    '# Every pair of codes, and how many items got it. The n column adds up to the items.',
    `${data} %>%`,
    `  count(${a}, ${b})`,
    '',
    "# Cohen's kappa: agreement after removing the agreement chance alone would produce.",
    '# Prints a list: statistic, method, interpretation, and raw.',
    'reliability(',
    `  pull(${data}, ${a}),`,
    `  pull(${data}, ${b}),`,
    '  method = "kappa"',
    ')',
    '',
    "# Krippendorff's alpha on the same two passes.",
    'reliability(',
    `  pull(${data}, ${a}),`,
    `  pull(${data}, ${b}),`,
    '  method = "alpha"',
    ')',
  );
};

// Reliability with the irr calls reliability() wraps: the MC 451 and MC 501 default since owner
// q-20261018-0044 = A (fixtures/v2v-plain/r2-reliability.R). The codes are numbered from the data,
// never from a fixed list, so any codebook works; the wrapper runs last as a check.
const v2vReliabilityPlain: Template = (p) => {
  const data = d(p, 'pilot');
  const a = p.columns?.[0] ?? 'pass_1';
  const b = p.columns?.[1] ?? 'pass_2';
  return lines(
    banner('Reliability: compare your two coding passes'),
    '# The share of items where pass 1 and pass 2 gave the same code.',
    `${data} %>%`,
    '  summarize(',
    '    items = n(),',
    `    share_agree = mean(${a} == ${b})`,
    '  )',
    '',
    '# Every pair of codes, and how many items got it. The n column adds up to the items.',
    `${data} %>%`,
    `  count(${a}, ${b})`,
    '',
    "# Cohen's kappa, from the irr package: give it the two code columns.",
    `${data} %>%`,
    `  select(${a}, ${b}) %>%`,
    '  irr::kappa2()',
    '',
    '# Every code either pass used, in one list, so both passes number the codes the same way.',
    `codes <- ${data} %>%`,
    `  pivot_longer(c(${a}, ${b}), values_to = "code") %>%`,
    '  distinct(code) %>%',
    '  pull(code)',
    '',
    "# Krippendorff's alpha: irr wants numbers and one row per pass, so number the codes, then",
    '# turn the two columns on their side.',
    `${data} %>%`,
    `  mutate(across(c(${a}, ${b}), ~ as.integer(factor(.x, levels = codes)))) %>%`,
    `  select(${a}, ${b}) %>%`,
    '  t() %>%',
    '  irr::kripp.alpha(method = "nominal")',
    '',
    '# Check: the v2v wrapper prints the same kappa.',
    'reliability(',
    `  pull(${data}, ${a}),`,
    `  pull(${data}, ${b}),`,
    '  method = "kappa"',
    ')',
  );
};

export const MC427_R2: Record<string, Template> = {
  'import-csv': mc427ImportCsv,
  filter: mc427Filter,
  select: mc427Select,
  mutate: mc427Mutate,
  count: mc427Count,
  'export-csv': mc427ExportCsv,
  'export-rds': mc427ExportRds,
};

export const V2V_R2: Record<string, Template> = {
  'import-csv': v2vImportCsv,
  'import-course-dataset': v2vImportCourseDataset,
  'import-rds': v2vImportRds,
  filter: v2vFilter,
  select: v2vSelect,
  mutate: v2vMutate,
  count: v2vCount,
  'clean-dates': v2vCleanDates,
  'join-chat-streams': v2vJoinChatStreams,
  'channel-lookup': v2vChannelLookup,
  'join-lookup': v2vJoinLookup,
  'convert-timestamp': v2vConvertTimestamp,
  'label-from-snapshot': v2vLabelFromSnapshot,
  'export-csv': v2vExportCsv,
  'export-rds': v2vExportRds,
  reliability: v2vReliability,
};

export const V2V_PLAIN_R2: Record<string, Template> = {
  reliability: v2vReliabilityPlain,
};
