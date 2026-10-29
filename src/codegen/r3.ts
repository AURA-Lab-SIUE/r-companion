// R3 Describe and plots: code templates (workstream E, #rgui).
// Reproduces the golden fixtures byte for byte with no overrides.

import { lines, banner } from './house';
import { GenParams, Template } from './types';
import { chosenBar, chosenBoxplot, chosenGroupedSummary, chosenHistogram, chosenLine, rName } from './chosen';

const d = (p: GenParams, def: string) => p.data ?? def;

// ---------------- MC 427 ----------------

const mc427Frequency: Template = (p) => {
  const data = d(p, 'df');
  const column = rName(p.column ?? 'posted_from');
  return lines(
    banner('Frequency table: count() and a percent column'),
    `# Count each value of ${column}, then add each count's share of the total, in percent.`,
    `${data} %>%`,
    `  count(${column}, sort = TRUE) %>%`,
    '  mutate(percent = round(100 * n / sum(n), 1))',
  );
};

const mc427Crosstab: Template = (p) => {
  const data = d(p, 'df');
  if (p.columns && p.columns.length === 2) return chosenCrosstab(data, p.columns[0], p.columns[1], false);
  return lines(
    banner('Crosstab: count every pair of two columns'),
    '# One row per pair of update and posted_from, with its count, then prop: the share of',
    "# each update's posts that came from each app (prop adds up to 1 within each update).",
    `${data} %>%`,
    '  count(update, posted_from) %>%',
    '  group_by(update) %>%',
    '  mutate(prop = round(n / sum(n), 3)) %>%',
    '  ungroup()',
    '',
    '# The same counts spread into a grid: one row per update, one column per app.',
    `${data} %>%`,
    '  count(update, posted_from) %>%',
    '  pivot_wider(names_from = posted_from, values_from = n, values_fill = 0)',
  );
};

// A crosstab of the two columns the student picked (code parity, 2026-10-28), such as their own
// codes against the AI's codes on the coding sheet. Plain tidyverse in every course. MC 451 and
// MC 501 drop rows missing either column first, as their default block does; MC 427 keeps them,
// so a blank code shows up as NA in the count, as in Module 4 DT03.
function chosenCrosstab(data: string, rows: string, cols: string, dropMissing: boolean): string {
  // a name with a space or other sign goes in backticks, as R needs
  const bt = (n: string) => (/^[A-Za-z.][A-Za-z0-9._]*$/.test(n) ? n : '`' + n + '`');
  rows = bt(rows);
  cols = bt(cols);
  const drop = dropMissing ? [`  filter(!is.na(${rows}), !is.na(${cols})) %>%`] : [];
  return lines(
    banner(`Crosstab: count every pair of ${rows} and ${cols}`),
    ...(dropMissing ? ['# Drop the rows missing either column first.'] : []),
    `# One row per pair of ${rows} and ${cols}, with n, how many rows have that pair, then prop:`,
    `# the share of each ${rows} value's rows in each ${cols} value (prop adds up to 1 within`,
    `# each ${rows} value).${dropMissing ? '' : ' A blank cell counts as NA.'}`,
    `${data} %>%`,
    ...drop,
    `  count(${rows}, ${cols}) %>%`,
    `  group_by(${rows}) %>%`,
    '  mutate(prop = round(n / sum(n), 3)) %>%',
    '  ungroup()',
    '',
    `# The same counts spread into a grid: one row per ${rows} value, one column per ${cols} value.`,
    `${data} %>%`,
    ...drop,
    `  count(${rows}, ${cols}) %>%`,
    `  pivot_wider(names_from = ${cols}, values_from = n, values_fill = 0)`,
  );
}

const mc427GroupedSummary: Template = (p) => {
  const data = d(p, 'df');
  if (p.columns) return chosenGroupedSummary(data, p.columns[0], p.columns[1]);
  return lines(
    banner('Summary by group: group_by() and summarize()'),
    '# For each value of share_button: how many posts, and the mean, median, and',
    '# standard deviation of like_count.',
    `${data} %>%`,
    '  group_by(share_button) %>%',
    '  summarize(',
    '    n = n(),',
    '    mean = mean(like_count),',
    '    median = median(like_count),',
    '    sd = sd(like_count)',
    '  )',
  );
};

const mc427Bar: Template = (p) => {
  const data = d(p, 'df');
  if (p.columns) return chosenBar(false, data, p.columns[0]);
  return lines(
    banner('Bar chart: one bar per category'),
    '# Count the posts from each app, then draw one bar per app, longest at the top.',
    '# Inside ggplot() the pieces join with +, not the pipe. The chart opens in a VS Code panel.',
    `${data} %>%`,
    '  count(posted_from) %>%',
    '  ggplot(aes(x = fct_reorder(posted_from, n), y = n)) +',
    '  geom_col() +',
    '  coord_flip() +',
    '  labs(',
    '    title = "Where #NoMansSky posts were sent from",',
    '    x = NULL,',
    '    y = "Posts",',
    '    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."',
    '  )',
    '',
    '# Save the chart to a picture file in your course folder. Prints nothing when a size is given.',
    'ggsave("posted-from-bar.png", width = 7, height = 5)',
  );
};

const mc427Histogram: Template = (p) => {
  const data = d(p, 'df');
  if (p.columns) return chosenHistogram(false, data, p.columns[0]);
  return lines(
    banner('Histogram: how one number is spread out'),
    '# Each bar counts the posts whose word_count falls in a 5-word band.',
    `ggplot(${data}, aes(x = word_count)) +`,
    '  geom_histogram(binwidth = 5) +',
    '  labs(',
    '    title = "Post length in words",',
    '    x = "Words per post",',
    '    y = "Posts",',
    '    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."',
    '  )',
    '',
    '# Save the chart to a picture file in your course folder.',
    'ggsave("word-count-histogram.png", width = 7, height = 5)',
  );
};

const mc427Boxplot: Template = (p) => {
  const data = d(p, 'df');
  if (p.columns) return chosenBoxplot(false, data, p.columns[0], p.columns[1]);
  return lines(
    banner('Boxplot: one number, compared across groups'),
    '# One box per value of share_button. The line in each box is the median; the box holds',
    '# the middle half of the posts. log1p() keeps the few viral posts from flattening the boxes.',
    `ggplot(${data}, aes(x = share_button, y = log1p(like_count))) +`,
    '  geom_boxplot() +',
    '  labs(',
    '    title = "Likes by share button",',
    '    x = "Sent with a console\'s share button",',
    '    y = "Likes, log(1 + likes)",',
    '    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."',
    '  )',
    '',
    '# Save the chart to a picture file in your course folder.',
    'ggsave("likes-boxplot.png", width = 7, height = 5)',
  );
};

// ---------------- v2v (MC 451 / MC 501) ----------------

const v2vFrequency: Template = (p) => {
  const data = d(p, 'analysis');
  const column = rName(p.column ?? 'channel_type');
  return lines(
    banner('Frequency table: count() and a percent column'),
    "# Count each channel type, then add each count's share of the total, in percent.",
    `${data} %>%`,
    `  count(${column}, sort = TRUE) %>%`,
    '  mutate(percent = round(100 * n / sum(n), 1))',
  );
};

const v2vCrosstab: Template = (p) => {
  const data = d(p, 'analysis');
  if (p.columns && p.columns.length === 2) return chosenCrosstab(data, p.columns[0], p.columns[1], true);
  return lines(
    banner('Crosstab: count every pair of two columns'),
    '# Drop the rows missing either column, then one row per pair with its count, then prop:',
    '# the share of each viewer band\'s messages in each channel type (adds up to 1 per band).',
    `${data} %>%`,
    '  filter(!is.na(viewer_band), !is.na(channel_type)) %>%',
    '  count(viewer_band, channel_type) %>%',
    '  group_by(viewer_band) %>%',
    '  mutate(prop = round(n / sum(n), 3)) %>%',
    '  ungroup()',
    '',
    '# The same counts spread into a grid: one row per viewer band, one column per channel type.',
    `${data} %>%`,
    '  filter(!is.na(viewer_band), !is.na(channel_type)) %>%',
    '  count(viewer_band, channel_type) %>%',
    '  pivot_wider(names_from = channel_type, values_from = n, values_fill = 0)',
  );
};

const v2vGroupedSummary: Template = (p) => {
  const data = d(p, 'analysis');
  if (p.columns) return chosenGroupedSummary(data, p.columns[0], p.columns[1]);
  return lines(
    banner('Summary by group: group_by() and summarize()'),
    '# For each channel type: how many messages, and the mean, median, and standard deviation',
    '# of message_length. Rows with no channel type are dropped first.',
    `${data} %>%`,
    '  filter(!is.na(channel_type)) %>%',
    '  group_by(channel_type) %>%',
    '  summarize(',
    '    n = n(),',
    '    mean = mean(message_length, na.rm = TRUE),',
    '    median = median(message_length, na.rm = TRUE),',
    '    sd = sd(message_length, na.rm = TRUE)',
    '  )',
  );
};

const v2vBar: Template = (p) => {
  if (p.columns) return chosenBar(true, d(p, 'streams'), p.columns[0]);
  return lines(
    banner('Bar chart: one bar per category'),
    '# Count the stream snapshots in each game, keep the ten largest, then draw one bar per game,',
    '# longest at the top. Inside ggplot() the pieces join with +, not the pipe. The bars share',
    '# one color: the axis already names each game, and the course palette stops at 8 colors.',
    'streams %>%',
    '  filter(!is.na(game)) %>%',
    '  count(game) %>%',
    '  slice_max(n, n = 10) %>%',
    '  ggplot(aes(x = fct_reorder(game, n), y = n)) +',
    '  geom_col() +',
    '  coord_flip() +',
    '  # Write the counts with commas (12,000), not 12000.',
    '  scale_y_continuous(labels = scales::label_comma()) +',
    '  labs(',
    '    title = "Most-streamed categories",',
    '    x = NULL,',
    '    y = "Stream snapshots",',
    '    caption = "Source: v2v package, November 2018 Twitch collection",',
    '    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."',
    '  ) +',
    '  v2v::theme_v2v()',
    '',
    '# Save the chart to a picture file in your figures folder.',
    'dir.create("figures", showWarnings = FALSE)',
    'ggsave("figures/top-games-bar.png", width = 7, height = 5)',
  );
};

const v2vHistogram: Template = (p) => {
  const data = d(p, 'analysis');
  if (p.columns) return chosenHistogram(true, data, p.columns[0]);
  return lines(
    banner('Histogram: how one number is spread out'),
    '# Each bar counts the messages whose length falls in a 5-character band. Lengths over 200',
    '# are dropped from the picture only, so the long tail does not squash the bars.',
    `${data} %>%`,
    '  filter(message_length <= 200) %>%',
    '  ggplot(aes(x = message_length)) +',
    '  geom_histogram(binwidth = 5) +',
    '  # Write the counts with commas (12,000), not 12000.',
    '  scale_y_continuous(labels = scales::label_comma()) +',
    '  labs(',
    '    title = "Message length",',
    '    subtitle = "Messages up to 200 characters",',
    '    x = "Characters per message",',
    '    y = "Messages",',
    '    caption = "Source: v2v package, November 2018 Twitch collection",',
    '    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."',
    '  ) +',
    '  v2v::theme_v2v()',
    '',
    '# Save the chart to a picture file in your figures folder.',
    'dir.create("figures", showWarnings = FALSE)',
    'ggsave("figures/message-length-histogram.png", width = 7, height = 5)',
  );
};

const v2vBoxplot: Template = (p) => {
  const data = d(p, 'analysis');
  if (p.columns) return chosenBoxplot(true, data, p.columns[0], p.columns[1]);
  return lines(
    banner('Boxplot: one number, compared across groups'),
    '# One box per channel type. The line in each box is the median; the box holds the middle',
    '# half of the messages. Rows missing either column are dropped first, and lengths are capped',
    '# at 120 for the picture only.',
    `${data} %>%`,
    '  filter(!is.na(channel_type), !is.na(message_length)) %>%',
    '  mutate(length_shown = pmin(message_length, 120)) %>%',
    '  ggplot(aes(x = channel_type, y = length_shown, fill = channel_type)) +',
    '  geom_boxplot(show.legend = FALSE) +',
    '  coord_flip() +',
    '  v2v::scale_fill_v2v() +',
    '  labs(',
    '    title = "Message length by channel type",',
    '    x = NULL,',
    '    y = "Message length (characters, capped at 120)",',
    '    caption = "Source: v2v package, November 2018 Twitch collection",',
    '    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."',
    '  ) +',
    '  v2v::theme_v2v()',
    '',
    '# Save the chart to a picture file in your figures folder.',
    'dir.create("figures", showWarnings = FALSE)',
    'ggsave("figures/message-length-boxplot.png", width = 7, height = 5)',
  );
};

// The time column comes from clean_dates(), the R2 helper (owner U7 = B), exactly as the live decks
// s23 and w12 shape this chart. ts is rebuilt from date here rather than assumed: in a describing
// session streams comes fresh from twitch_streams() with no ts column, and a bare ts would then
// find stats::ts() instead of a column. On a streams that already has ts the values are the same.
const v2vLine: Template = (p) => {
  if (p.columns) return chosenLine(true, d(p, 'streams'), p.columns[0], p.unit ?? 'hour', p.groupBy || undefined);
  return lines(
    banner('Line chart: a total over time'),
    '# Bucket the stream snapshots into six-hour blocks, keep the five biggest game categories and',
    '# lump the rest into "Other", then add up the viewers in each block. clean_dates() makes the',
    '# ts time column from the millisecond date, as in the wrangling step (without v2v:',
    '# as_datetime(date / 1000)), floor_date rounds it down to its six-hour block, and fct_lump_n',
    '# keeps the top five games. This line prints nothing.',
    'viewers_over_time <- streams %>%',
    '  filter(!is.na(game)) %>%',
    '  mutate(',
    '    ts = clean_dates(date),',
    '    six_hour = floor_date(ts, "6 hours"),',
    '    category = fct_lump_n(game, n = 5)',
    '  ) %>%',
    '  group_by(six_hour, category) %>%',
    '  summarize(total_viewers = sum(viewers), .groups = "drop")',
    '',
    '# One line per game category: time on the x axis, summed viewers on the y, color by category.',
    '# A line implies order, so it is right for time and wrong for unordered groups. Inside ggplot()',
    '# the pieces join with +, not the pipe.',
    'viewers_over_time %>%',
    '  ggplot(aes(x = six_hour, y = total_viewers, color = category)) +',
    '  geom_line(linewidth = 0.9) +',
    '  # Write the viewer counts with commas (20,000,000), not in scientific notation (2.0e+07).',
    '  scale_y_continuous(labels = scales::label_comma()) +',
    '  labs(',
    '    title = "Concurrent viewers by game category",',
    '    x = "Date (UTC, six-hour buckets)",',
    '    y = "Total viewers in bucket",',
    '    color = "Category",',
    '    caption = "Source: v2v package, November 2018 Twitch collection",',
    '    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."',
    '  ) +',
    '  v2v::scale_colour_v2v() +',
    '  v2v::theme_v2v()',
    '',
    '# Save the chart to a picture file in your figures folder.',
    'dir.create("figures", showWarnings = FALSE)',
    'ggsave("figures/viewers-over-time-line.png", width = 7, height = 5)',
  );
};

const v2vHistogramGrouped: Template = (p) => {
  const data = d(p, 'analysis');
  return lines(
    banner('Grouped histogram: two groups overlaid'),
    "# Each bar shows the SHARE of a group's messages whose length falls in a 5-character band, not",
    '# the count, so a small group and a big group draw to the same height and their shapes can be',
    '# compared. (Non-gaming channels are about one message in ten here; by count they would barely',
    '# show.) Rows with no channel label or no message length are dropped first, and lengths are',
    '# capped at 120 for the picture only. position = "identity" puts both groups on the same',
    '# baseline, and alpha makes each one see-through so the overlap shows.',
    `${data} %>%`,
    '  filter(!is.na(is_gaming), !is.na(message_length)) %>%',
    '  mutate(length_shown = pmin(message_length, 120)) %>%',
    '  ggplot(aes(x = length_shown, y = after_stat(density), fill = is_gaming)) +',
    '  geom_histogram(binwidth = 5, position = "identity", alpha = 0.55) +',
    '  v2v::scale_fill_v2v() +',
    '  labs(',
    '    title = "Message length by channel type",',
    "    subtitle = \"Share of each group's messages, lengths capped at 120 characters\",",
    '    x = "Message length (characters, capped at 120)",',
    "    y = \"Share of the group's messages\",",
    '    fill = "Gaming channel",',
    '    caption = "Source: v2v package, November 2018 Twitch collection",',
    '    alt = "YOUR TURN: one sentence saying what the chart shows, for a reader who cannot see it."',
    '  ) +',
    '  v2v::theme_v2v()',
    '',
    '# Save the chart to a picture file in your figures folder.',
    'dir.create("figures", showWarnings = FALSE)',
    'ggsave("figures/message-length-grouped-histogram.png", width = 7, height = 5)',
  );
};

// How often two code columns match (code parity, 2026-10-28): the three checks of MC 427 Module 4
// DT03, on the columns the student picks. Plain tidyverse (owner q-20261028-0007 = A).
const mc427Agreement: Template = (p) => {
  const data = d(p, 'codes');
  const [mine, theirs] = (p.columns && p.columns.length === 2 ? p.columns : ['sentiment', 'ai_sentiment']).map(rName);
  const id = rName(p.column ?? 'review_id');
  return lines(
    banner(`Agreement: how often ${mine} and ${theirs} match`),
    `# ${mine} == ${theirs} is TRUE or FALSE for each row; mean() of that is the share TRUE,`,
    '# because R counts TRUE as 1 and FALSE as 0. Prints one number between 0 and 1.',
    `${data} %>%`,
    `  summarize(share_agree = mean(${mine} == ${theirs}))`,
    '',
    `# Every pair of codes, with n, how many rows got that pair. The rows where the two codes`,
    '# are the same are the agreements.',
    `${data} %>%`,
    `  count(${mine}, ${theirs})`,
    '',
    `# The rows where the two codes differ (!= means "is not equal to"), with ${id} so you can`,
    '# find each one.',
    `${data} %>%`,
    `  filter(${mine} != ${theirs}) %>%`,
    `  select(${id}, ${mine}, ${theirs})`,
  );
};

export const MC427_R3: Record<string, Template> = {
  agreement: mc427Agreement,
  frequency: mc427Frequency,
  crosstab: mc427Crosstab,
  'grouped-summary': mc427GroupedSummary,
  bar: mc427Bar,
  histogram: mc427Histogram,
  boxplot: mc427Boxplot,
};

export const V2V_R3: Record<string, Template> = {
  frequency: v2vFrequency,
  crosstab: v2vCrosstab,
  'grouped-summary': v2vGroupedSummary,
  bar: v2vBar,
  histogram: v2vHistogram,
  'histogram-grouped': v2vHistogramGrouped,
  line: v2vLine,
  boxplot: v2vBoxplot,
};
