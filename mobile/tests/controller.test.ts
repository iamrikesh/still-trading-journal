import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJournalController } from '../src/journal/controller.ts';
import { emotions } from '../src/journal/emotions.ts';
import type { JournalRepository, Moment } from '../src/storage/types.ts';

const fomo = emotions[0]!;
const capturedAt = '2026-09-20T10:00:00.000Z';

test('tapping exposes support and the original timestamp before storage is ready', () => {
  const controller = createJournalController({
    repository: () => new Promise<JournalRepository>(() => {}),
    now: () => capturedAt,
    id: () => 'moment-1',
  });
  controller.tap(fomo);
  assert.equal(controller.getSnapshot().selected?.id, 'fomo');
  assert.equal(controller.getSnapshot().moment?.createdAt, capturedAt);
  assert.equal(controller.getSnapshot().saveStatus, 'saving');
});

test('a saved tap appears in history without requiring a note or an extra Save', async () => {
  const rows: Moment[] = [];
  const repo: JournalRepository = {
    save: async moment => { rows.push(moment); },
    list: async () => rows,
    remove: async () => {},
  };
  const controller = createJournalController({ repository: async () => repo, now: () => capturedAt, id: () => 'moment-1' });
  await controller.tap(fomo);
  assert.equal(controller.getSnapshot().saveStatus, 'saved');
  assert.deepEqual(controller.getSnapshot().history.map(row => [row.id, row.emotionId, row.createdAt]), [['moment-1', 'fomo', capturedAt]]);
});

test('a failed save leaves support visible and retry keeps the same timestamp and ID', async () => {
  let diskFull = true;
  const rows = new Map<string, Moment>();
  const repo: JournalRepository = {
    save: async moment => { if (diskFull) throw new Error('disk full'); rows.set(moment.id, moment); },
    list: async () => [...rows.values()], remove: async () => {},
  };
  const controller = createJournalController({ repository: async () => repo, now: () => capturedAt, id: () => 'original' });
  await controller.tap(fomo);
  assert.equal(controller.getSnapshot().selected?.id, 'fomo');
  assert.equal(controller.getSnapshot().saveStatus, 'failed');
  assert.equal(controller.getSnapshot().failed.length, 1);
  diskFull = false;
  await controller.retry('original');
  assert.equal(controller.getSnapshot().saveStatus, 'saved');
  assert.equal(controller.getSnapshot().failed.length, 0);
  assert.deepEqual([...rows.values()].map(row => [row.id, row.createdAt]), [['original', capturedAt]]);
});

test('history read failure does not falsely report that a successful write failed', async () => {
  const controller = createJournalController({
    repository: async () => ({ save: async () => {}, list: async () => { throw new Error('read failed'); }, remove: async () => {} }),
    now: () => capturedAt, id: () => 'saved',
  });
  await controller.tap(fomo);
  assert.equal(controller.getSnapshot().saveStatus, 'saved');
  assert.equal(controller.getSnapshot().historyStatus, 'failed');
  assert.equal(controller.getSnapshot().failed.length, 0);
});

test('an older save completing does not mark the current unsaved moment as saved', async () => {
  let finishFirst!: () => void;
  let nextId = 0;
  const controller = createJournalController({
    repository: async () => ({
      save: moment => moment.id === '1' ? new Promise<void>(resolve => { finishFirst = resolve; }) : new Promise<void>(() => {}),
      list: async () => [], remove: async () => {},
    }), now: () => capturedAt, id: () => String(++nextId),
  });
  const first = controller.tap(fomo);
  await Promise.resolve();
  void controller.tap(emotions[1]!);
  finishFirst();
  await first;
  assert.equal(controller.getSnapshot().selected?.id, 'hesitation');
  assert.equal(controller.getSnapshot().saveStatus, 'saving');
});

test('repeated failed saves keep at most 50 unsaved drafts while still showing support', async () => {
  let id = 0;
  const controller = createJournalController({
    repository: async () => { throw new Error('storage unavailable'); },
    now: () => capturedAt, id: () => String(++id),
  });
  for (let count = 0; count < 55; count++) await controller.tap(fomo);
  assert.equal(controller.getSnapshot().failed.length, 50);
  assert.equal(controller.getSnapshot().selected?.id, 'fomo');
  assert.equal(controller.getSnapshot().saveStatus, 'failed');
});

test('a capture ID failure still opens support and reports that nothing was logged', async () => {
  const controller = createJournalController({
    repository: () => new Promise<JournalRepository>(() => {}),
    now: () => capturedAt, id: () => { throw new Error('random source unavailable'); },
  });
  await controller.tap(fomo);
  assert.equal(controller.getSnapshot().selected?.id, 'fomo');
  assert.equal(controller.getSnapshot().saveStatus, 'failed');
  assert.equal(controller.getSnapshot().moment, null);
  assert.equal(controller.getSnapshot().saveError, 'capture');
});

test('Older keeps displayed pages after failure, retries the same cursor and ends explicitly', async () => {
  const rows: Moment[] = Array.from({ length: 55 }, (_, n) => ({
    id: String(55 - n).padStart(2, '0'), emotionId: 'fomo', emotionLabel: 'FOMO',
    createdAt: capturedAt, supportText: 'Snapshot.',
  }));
  let failOlder = true;
  const repo: JournalRepository = {
    save: async () => {}, remove: async () => {},
    list: async before => {
      if (before && failOlder) throw Error('offline');
      const start = before ? rows.findIndex(row => row.id === before.id) + 1 : 0;
      return rows.slice(start, start + 50);
    },
  };
  const controller = createJournalController({ repository: async () => repo, now: () => capturedAt, id: () => 'new' });
  await controller.refresh();
  assert.equal(controller.getSnapshot().history.length, 50);
  await controller.older();
  assert.equal(controller.getSnapshot().olderStatus, 'failed');
  assert.equal(controller.getSnapshot().history.length, 50);
  failOlder = false;
  await controller.older();
  assert.equal(controller.getSnapshot().history.length, 55);
  assert.equal(controller.getSnapshot().olderStatus, 'end');
  assert.equal(new Set(controller.getSnapshot().history.map(row => row.id)).size, 55);
});

test('Newest refresh and controller removal ignore stale Older responses', async () => {
  const a = { id: 'a', emotionId: 'fomo', emotionLabel: 'FOMO', createdAt: capturedAt, supportText: 'Snapshot.' };
  const b = { ...a, id: 'b' };
  const tail = Array.from({ length: 49 }, (_, n) => ({ ...a, id: `tail-${n}` }));
  let release!: (rows: Moment[]) => void;
  let reads = 0;
  const repo: JournalRepository = {
    save: async () => {}, remove: async () => {},
    list: async before => {
      if (before) return new Promise<Moment[]>(resolve => { release = resolve; });
      return ++reads === 1 ? [a, ...tail] : [b, ...tail];
    },
  };
  const controller = createJournalController({ repository: async () => repo, now: () => capturedAt, id: () => 'new' });
  await controller.refresh();
  const pending = controller.older();
  await Promise.resolve(); await Promise.resolve();
  await controller.refresh();
  release([a]); await pending;
  assert.equal(controller.getSnapshot().history[0]?.id, 'b');
  const pendingDelete = controller.older();
  await Promise.resolve(); await Promise.resolve();
  await controller.remove('b');
  release([b]); await pendingDelete;
  assert.equal(controller.getSnapshot().history[0]?.id, 'b');
});
