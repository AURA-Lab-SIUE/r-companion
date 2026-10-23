// Join two tables by a shared column (0.5.3, #rgui Rank 7): the pure helpers and the template.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { tableSources, sharedColumns, repeatWarning } from '../src/tables';
import { comment } from '../src/codegen/house';
import { generate, hasTask } from '../src/codegen';

test('tableSources reads back the files and the course corpus a script loads', () => {
  const code = [
    'library(tidyverse)',
    'videos <- read_csv("data/videos.csv")',
    'notes <- readxl::read_excel("data/coded.xlsx", sheet = "Coder notes")',
    'saved <- read_rds("C:/work/saved.RDS")',
    'chat <- twitch_chat()',
    'joined <- videos %>% left_join(chat, by = join_by(channel))',
  ].join('\n');
  const s = tableSources(code, 'C:\\course');
  assert.equal(s.get('videos'), 'readr::read_csv("C:/course/data/videos.csv", show_col_types = FALSE)');
  assert.equal(s.get('notes'), 'readxl::read_excel("C:/course/data/coded.xlsx", sheet = "Coder notes")');
  assert.equal(s.get('saved'), 'readRDS("C:/work/saved.RDS")', 'an absolute path stays as it is');
  assert.equal(s.get('chat'), 'v2v::twitch_chat()');
  assert.equal(s.has('joined'), false, 'a table built from others has no source');
});

test('the key list is the columns both tables have, in the left order', () => {
  assert.deepEqual(sharedColumns(['video_id', 'channel', 'region', 'title'], ['channel', 'region', 'subscribers']), ['channel', 'region']);
  assert.deepEqual(sharedColumns(['a'], ['b']), []);
});

test('a repeating key on the right gets a warning; a unique one does not', () => {
  assert.equal(repeatWarning('channel', 'channels', 50, 50), undefined);
  assert.match(repeatWarning('channel', 'channels', 47, 50)!, /^channel repeats in channels \(3 of 50 rows/);
});

test('comment() wraps long names under 97 characters per line', () => {
  const lines = comment(`Keep every row of ${'a_very_long_table_name_'.repeat(3)} and add the columns of another_long_table_name.`);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((l) => l.startsWith('# ') && l.length <= 96));
});

test('the join block: left_join by default, inner_join on request, the two checks, both dialects', () => {
  assert.ok(hasTask('mc427', 'join-tables') && hasTask('mc451', 'join-tables') && hasTask('mc501', 'join-tables'));
  const left = generate('mc451', 'join-tables', { data: 'videos', right: 'channels', column: 'channel' });
  assert.ok(left.includes('videos_channels <- videos %>%\n  left_join(channels, by = join_by(channel))\n'));
  assert.ok(left.includes('nrow(videos_channels)\nvideos %>%\n  anti_join(channels, by = join_by(channel)) %>%\n  nrow()\n'));
  const inner = generate('mc427', 'join-tables', { data: 'df', right: 'apps', column: 'posted_from', keepOnlyMatches: true });
  assert.ok(inner.includes('  inner_join(apps, by = join_by(posted_from))'));
  assert.ok(inner.includes('# Keep only the rows of df'));
  assert.ok(!left.includes('|>') && !inner.includes('|>'), 'magrittr pipe only');
});
