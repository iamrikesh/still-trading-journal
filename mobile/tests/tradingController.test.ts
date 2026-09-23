import assert from 'node:assert/strict';
import test from 'node:test';
import { createTradingController } from '../src/journal/tradingController.ts';
import type { TradingRepository, TradingSession } from '../src/storage/tradingTypes.ts';

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
