import assert from 'node:assert/strict';
import test from 'node:test';
import { createTradingController } from '../src/journal/tradingController.ts';
import type { TradingRepository, TradingSession } from '../src/storage/tradingTypes.ts';
import type { Moment } from '../src/storage/types.ts';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function rig() {
  let row: TradingSession | null = null;
  const repository = {
    active: async () => row,
    start: async ({ id, title, at }: { id: string; title: string; at: string }) => row = { id, title, startedAt: at, endedAt: null, originalStartedAt: at, originalEndedAt: null, adjustedAt: null, archivedAt: null },
    end: async (_id: string, at: string) => { if (row) row = { ...row, endedAt: at, originalEndedAt: at }; },
    sessions: async () => row ? [row] : [],
  } as unknown as TradingRepository;
  const audio = { stopForSessionEnd: async () => true };
  const controller = createTradingController({ repository: async () => repository, recording: audio, id: () => 'session-1', now: () => '2026-09-23T10:00:00.000Z' });
  return { controller, repository, audio };
}

test('End invalidates a pending Record before permission resolves', async () => {
  const r = rig(); await r.controller.start('');
  const release = deferred<boolean>(); r.audio.stopForSessionEnd = () => release.promise;
  const ending = r.controller.end();
  assert.equal(r.controller.getSnapshot().busy, true);
  release.resolve(true); await ending;
  assert.equal(r.controller.getSnapshot().active, null);
});

test('End keeps session open when audio release is unconfirmed', async () => {
  const r = rig(); await r.controller.start(''); r.audio.stopForSessionEnd = async () => false;
  await r.controller.end();
  assert.ok(r.controller.getSnapshot().active);
  assert.match(r.controller.getSnapshot().error!, /Stop again/);
});

test('End write failure keeps session open for retry after release', async () => {
  const r = rig(); await r.controller.start('');
  r.repository.end = async () => { throw Error('private path'); };
  await r.controller.end();
  assert.ok(r.controller.getSnapshot().active);
  assert.match(r.controller.getSnapshot().error!, /try again/i);
  assert.doesNotMatch(r.controller.getSnapshot().error!, /private path/);
});

test('boundary correction converts entered timezone to canonical UTC and rejects reversed times', async () => {
  const r = rig(); await r.controller.start('');
  const saved: { value?: { startedAt: string; endedAt: string | null } } = {};
  r.repository.adjust = async (_id, input) => { saved.value = input; };
  await r.controller.adjust('session-1', { title: '', startedAt: '2026-09-23T15:45:00+05:45', endedAt: null });
  assert.equal(saved.value?.startedAt, '2026-09-23T10:00:00.000Z');
  await r.controller.adjust('session-1', { title: '', startedAt: '2026-09-23T12:00:00+05:45', endedAt: '2026-09-23T11:00:00+05:45' });
  assert.match(r.controller.getSnapshot().error!, /End must be/);
});

test('switching sessions clears old rows and Older cannot use their cursor while the new first page waits', async () => {
  const r = rig();
  const firstB = deferred<Moment[]>();
  const requests: { id: string; before?: { at: string; id: string } }[] = [];
  const row = (id: string): Moment => ({ id, emotionId: 'fomo', emotionLabel: 'FOMO', createdAt: '2026-09-23T10:00:00.000Z', supportText: 'Captured.' });
  r.repository.timeline = async (id, before) => {
    requests.push({ id, before });
    return id === 'session-b' && !before ? firstB.promise : Array.from({ length: 30 }, (_, n) => row(`${id}-${n}`));
  };
  await r.controller.timeline('session-a');
  assert.equal(r.controller.getSnapshot().timeline.length, 30);
  const switching = r.controller.timeline('session-b');
  assert.deepEqual(r.controller.getSnapshot().timeline, []);
  assert.equal(r.controller.getSnapshot().timelineStatus, 'loading');
  await r.controller.timeline('session-b', true);
  assert.deepEqual(requests.map(request => request.id), ['session-a', 'session-b']);
  firstB.resolve([row('session-b-first')]); await switching;
  assert.deepEqual(r.controller.getSnapshot().timeline.map(moment => moment.id), ['session-b-first']);
  assert.equal(r.controller.getSnapshot().moreTimeline, false);
  assert.equal(r.controller.getSnapshot().timelineStatus, 'ready');
});

test('failed session switch keeps old rows and cursor hidden, then Newest retry owns its page', async () => {
  const r = rig();
  const row: Moment = { id: 'session-a-last', emotionId: 'fomo', emotionLabel: 'FOMO', createdAt: '2026-09-23T10:00:00.000Z', supportText: 'Captured.' };
  let failB = true;
  const requests: { id: string; before?: { at: string; id: string } }[] = [];
  r.repository.timeline = async (id, before) => {
    requests.push({ id, before });
    if (id === 'session-b' && failB) throw Error('read');
    return id === 'session-a' ? Array.from({ length: 30 }, (_, n) => ({ ...row, id: `session-a-${n}` })) : [{ ...row, id: 'session-b-only' }];
  };
  await r.controller.timeline('session-a');
  await r.controller.timeline('session-b');
  assert.deepEqual(r.controller.getSnapshot().timeline, []);
  assert.equal(r.controller.getSnapshot().moreTimeline, false);
  assert.equal(r.controller.getSnapshot().timelineStatus, 'failed');
  await r.controller.timeline('session-b', true);
  assert.deepEqual(requests.map(request => request.id), ['session-a', 'session-b']);
  failB = false; await r.controller.timeline('session-b');
  assert.deepEqual(r.controller.getSnapshot().timeline.map(moment => moment.id), ['session-b-only']);
  assert.equal(r.controller.getSnapshot().timelineStatus, 'ready');
});
