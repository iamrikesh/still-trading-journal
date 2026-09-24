import test from 'node:test';
import assert from 'node:assert/strict';
import { backDestination } from '../src/journal/navigation.ts';

test('writing returns to its entry screen, including a newly created note', () => {
  for (const origin of ['now', 'support', 'history', 'clips', 'sessions'] as const) {
    assert.equal(backDestination('writing', origin), origin);
  }
});

test('settings and reminder editing return through their parent screens', () => {
  assert.equal(backDestination('editor', 'now'), 'reminders');
  assert.equal(backDestination('reminders', 'now'), 'settings');
  assert.equal(backDestination('settings', 'now'), 'now');
  assert.equal(backDestination('support', 'now'), 'now');
  assert.equal(backDestination('clips', 'now'), 'history');
  assert.equal(backDestination('now', 'now'), null);
});
