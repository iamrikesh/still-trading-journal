import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, intent, moment } from './helpers/clipFixture.ts';
import { createJournalSession } from '../src/storage/journalSession.ts';
import { createNativeAudio } from '../src/recording/nativeAudio.ts';

async function rig() {
  const f = await fixture();
  let current: string | null = null;
  const vault = Object.assign(f.vault, {
    async initialize() {}, async verify(i: typeof intent) { return f.vault.seal(i); },
    async prepareFixture() {}, async inspect() { return { staging: false, final: false, pending: false, verification: false }; },
  });
  const audio = {
    async startCapture(i: typeof intent) {
      assert.equal(f.sqlite.prepare('SELECT status FROM clips WHERE id = ?').get(i.id)?.status, 'pending');
      if (current) throw Error('busy');
      current = i.id; f.vault.seed(i);
    },
    async stopCapture(id: string) { assert.equal(id, current); current = null; },
    async startPlayback(i: typeof intent) { current = i.id; },
    async stopPlayback() { current = null; },
    async status() { return { id: current, state: current ? 'recording' as const : 'idle' as const, durationMs: 0 }; },
    async usage() { return 16; },
  };
  const session = await createJournalSession(f.db, vault, { debug: false, id: () => 'unused', now: () => intent.createdAt, audio });
  return { f, session, audio, current: () => current };
}

test('capture persists intent first, commits after stop, appends clips and authorizes playback from stored owner', async () => {
  const r = await rig();
  try {
    await assert.rejects(() => r.session.audio!.start({ ...intent, momentId: 'absent' }));
    assert.equal(r.current(), null);
    await r.session.audio!.start(intent);
    await assert.rejects(() => r.session.audio!.play(intent.id));
    await r.session.audio!.stop(intent.id);
    assert.equal((await r.session.clips!.list(intent.momentId))[0]!.status, 'saved');
    await r.session.audio!.start({ ...intent, id: 'clip-2' });
    await r.session.audio!.stop('clip-2');
    assert.equal((await r.session.clips!.list(intent.momentId)).length, 2);
    await r.session.audio!.play(intent.id);
    assert.equal(r.current(), intent.id);
    await r.session.audio!.stopPlayback();
    await r.session.clips!.remove(intent.id);
    await assert.rejects(() => r.session.audio!.play(intent.id));
  } finally { r.f.close(); }
});

test('failed capture retains an intent that can be explicitly discarded', async () => {
  const r = await rig();
  try {
    r.audio.startCapture = async () => { throw Error('private error'); };
    await assert.rejects(() => r.session.audio!.start(intent), /Journal session unavailable/);
    assert.equal((await r.session.clips!.list(intent.momentId))[0]!.status, 'pending');
    await r.session.clips!.remove(intent.id);
    assert.equal((await r.session.recovery()).pending, 0);
  } finally { r.f.close(); }
});

test('audio bridge rejects malformed status and sanitizes native errors', async () => {
  const bridge = {
    async startCapture() {}, async stopCapture() {}, async startPlayback() {}, async stopPlayback() {},
    async audioStatus(): Promise<unknown> { return { id: 'clip-1', state: 'recording', durationMs: -1, path: 'private' }; },
    async audioUsage(): Promise<unknown> { return -1; },
  };
  const audio = createNativeAudio(bridge)!;
  await assert.rejects(audio.status, /Audio unavailable/);
  await assert.rejects(audio.usage, /Audio unavailable/);
  bridge.audioStatus = async () => ({ id: 'clip-1', state: 'recording', durationMs: 1000, path: 'private' });
  assert.deepEqual(await audio.status(), { id: 'clip-1', state: 'recording', durationMs: 1000 });
  assert.equal(createNativeAudio({}), null);
});
test('pending owner discovery finds older moments and recovery retries hidden failed deletions', async () => {
  const r = await rig();
  try {
    for (let i = 0; i < 51; i++) await r.session.journal.save({ ...moment(`new-${i}`), createdAt: '2026-09-22T10:00:00.000Z' });
    assert.equal((await r.session.journal.list()).some(m => m.id === intent.momentId), false);
    await r.session.audio!.start(intent); await r.session.audio!.stop(intent.id);
    r.f.vault.failures.add(`all:${intent.id}`);
    await assert.rejects(() => r.session.clips!.remove(intent.id));
    assert.equal((await r.session.clips!.list(intent.momentId)).length, 0);
    assert.equal((await r.session.audio!.pendingOwners())[0]!.id, intent.momentId);
    r.f.vault.failures.clear(); await r.session.clips!.recover();
    assert.equal((await r.session.recovery()).pending, 0);
    assert.equal((await r.session.audio!.pendingOwners()).length, 0);
  } finally { r.f.close(); }
});
