// Audit fixes 2026-11-12 (owner q-20261112-0014: R-related items only).
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { generate } from '../src/codegen';

test('F6: Bar chart from a table that already holds the numbers keeps the row order, in every course', () => {
  const v2v = generate('mc451', 'bar', { data: 'chat_by_hour', columns: ['hour'], heights: 'messages' });
  assert.match(v2v, /chat_by_hour %>%\n  ggplot\(aes\(x = fct_inorder\(as\.character\(hour\)\), y = messages\)\) \+\n  geom_col\(\) \+/);
  assert.ok(!v2v.includes('count('), 'no counting: the heights are given');
  assert.ok(!v2v.includes('coord_flip'), 'hours run left to right');
  assert.ok(v2v.includes('ggsave("figures/messages-by-hour-bar.png"'));
  assert.ok(v2v.includes('v2v::theme_v2v()') && v2v.includes('alt = "YOUR TURN'));
  assert.equal(generate('mc501', 'bar', { data: 'chat_by_hour', columns: ['hour'], heights: 'messages' }), v2v);
  const m = generate('mc427', 'bar', { data: 'funnel', columns: ['month'], heights: 'players' });
  assert.ok(m.includes('ggplot(aes(x = fct_inorder(as.character(month)), y = players))'));
  assert.ok(m.includes('ggsave("players-by-month-bar.png"') && !m.includes('theme_v2v') && !m.includes('label_comma'));
  // The counted bar is unchanged
  assert.ok(generate('mc427', 'bar', { data: 'df', columns: ['posted_from'] }).includes('count(posted_from)'));
});
