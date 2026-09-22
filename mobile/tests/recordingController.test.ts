import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRecordingController } from '../src/recording/controller.ts';
import type { AudioStatus } from '../src/recording/nativeAudio.ts';
import type { Clip, ClipIntent } from '../src/storage/clipTypes.ts';
import type { JournalSession } from '../src/storage/journalSession.ts';

function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function rig() {
  const rows: Clip[] = [];
  let counter = 0;
  let native: AudioStatus = { id: null, state: 'idle', durationMs: 0 };
  let failFinish = false;
  let permission = async () => true;
  const finish = async (id: string) => {
    if (failFinish) throw Error('private/path');
    Object.assign(rows.find(c => c.id === id)!, { status: 'saved', bytes: 16000, durationMs: 1000 });
  };
  const session: JournalSession = {
    journal: { async save() {}, async list() { return []; }, async remove() {} }, exercise: null,
    recovery: async () => ({ pending: rows.filter(c => c.status !== 'saved').length }),
    clips: {
      async begin() {}, finish,
      async list(id) { return rows.filter(c => c.momentId === id).map(c => ({ ...c })); },
      async remove(id) { rows.splice(rows.findIndex(c => c.id === id), 1); },
      async recover() { return { completed: 0, pending: 0 }; },
    },
    audio: {
      async start(i: ClipIntent) { rows.push({ ...i, status: 'pending', bytes: null, durationMs: null }); native = { id: i.id, state: 'recording', durationMs: 0 }; },
      async stop(id) { native = { id, state: 'stopped', durationMs: 1000 }; await finish(id); },
      async releaseCapture(id: string) { native = { id, state: 'stopped', durationMs: 1000 }; },
      async play(id) { native = { id, state: 'playing', durationMs: 0 }; },
      async stopPlayback() { native = { id: null, state: 'idle', durationMs: 0 }; },
      async status() { return native; }, async usage() { return rows.length * 16000; },
      async pendingOwners() { return []; },
    },
  };
  const controller = createRecordingController({ session: async () => session, permission: () => permission(), id: () => `clip-${++counter}`, now: () => '2026-09-22T10:00:00.000Z' });
  return { controller, rows, session, permission: (p: typeof permission) => { permission = p; }, fail: (v: boolean) => { failFinish = v; }, status: (s: AudioStatus) => { native = s; } };
}

test('denied permission leaves no intent and exposes a helpful message', async () => {
  const r = rig(); r.permission(async () => false);
  await r.controller.select('moment-a'); await r.controller.record();
  assert.equal(r.rows.length, 0);
  assert.match(r.controller.getSnapshot().message!, /Microphone permission/);
});
test('navigation while permission is pending cancels capture', async () => {
  const r = rig(); const p = deferred<boolean>(); r.permission(() => p.promise);
  await r.controller.select('moment-a'); const recording = r.controller.record();
  await new Promise(resolve => setImmediate(resolve));
  const navigation = r.controller.select('moment-b'); p.resolve(true);
  await Promise.all([recording, navigation]);
  assert.equal(r.rows.length, 0);
  assert.equal(r.controller.getSnapshot().momentId, 'moment-b');
});
test('duplicate Record and Stop append once and preserve original owner on navigation', async () => {
  const r = rig(); await r.controller.select('moment-a');
  await Promise.all([r.controller.record(), r.controller.record()]);
  assert.equal(r.rows.length, 1);
  await r.controller.select('moment-b');
  assert.equal(r.rows[0]!.momentId, 'moment-a'); assert.equal(r.rows[0]!.status, 'saved');
  await r.controller.record(); await Promise.all([r.controller.stop(), r.controller.stop()]);
  assert.equal(r.rows.length, 2); assert.equal(r.rows[1]!.momentId, 'moment-b');
});
test('save failure stays pending, retry keeps ID and sanitized error, then another clip can start', async () => {
  const r = rig(); await r.controller.select('moment-a'); await r.controller.record();
  r.fail(true); await r.controller.stop();
  assert.equal(r.rows[0]!.status, 'pending'); assert.equal(r.controller.getSnapshot().phase, 'ready');
  assert.doesNotMatch(r.controller.getSnapshot().message!, /private/);
  await r.controller.record(); assert.equal(r.rows.length, 1);
  r.fail(false); await r.controller.retry('clip-1');
  assert.equal(r.rows[0]!.status, 'saved'); await r.controller.record(); assert.equal(r.rows.length, 2);
});
test('native automatic stop commits once and foreground loss ends playback', async () => {
  const r = rig(); await r.controller.select('moment-a'); await r.controller.record();
  r.status({ id: 'clip-1', state: 'stopped', durationMs: 240000 });
  await r.controller.poll(); assert.equal(r.rows[0]!.status, 'saved');
  await r.controller.play('clip-1'); assert.equal(r.controller.getSnapshot().phase, 'playing');
  await r.controller.background(); assert.equal(r.controller.getSnapshot().phase, 'ready');
  assert.equal((await r.session.audio!.status()).state, 'idle');
});
test('leaving during native start stops the original capture after start settles', async () => {
  const r = rig(); const gate = deferred<void>(); const start = r.session.audio!.start;
  r.session.audio!.start = async i => { await gate.promise; await start(i); };
  await r.controller.select('moment-a'); const recording = r.controller.record();
  await new Promise(resolve => setImmediate(resolve));
  const leaving = r.controller.select(null); gate.resolve();
  await Promise.all([recording, leaving]);
  assert.equal(r.rows[0]!.status, 'saved'); assert.equal(r.controller.getSnapshot().momentId, null);
});
test('explicit Stop waits for an in-flight status poll instead of dropping the tap', async () => {
  const r = rig(); await r.controller.select('moment-a'); await r.controller.record();
  const gate = deferred<AudioStatus>(); r.session.audio!.status = () => gate.promise;
  const polling = r.controller.poll();
  const stopping = r.controller.stop();
  gate.resolve({ id: 'clip-1', state: 'recording', durationMs: 1000 });
  await Promise.all([polling, stopping]);
  assert.equal(r.rows[0]!.status, 'saved');
  assert.equal(r.controller.getSnapshot().phase, 'ready');
});
test('unconfirmed capture release keeps a visible retry across navigation and saves only after release', async () => {
  const r = rig(); await r.controller.select('moment-a'); await r.controller.record();
  const release = r.session.audio!.releaseCapture;
  r.session.audio!.releaseCapture = async () => { throw Error('release uncertain'); };
  await r.controller.stop();
  assert.equal(r.controller.getSnapshot().phase, 'cleanup');
  assert.equal(r.controller.getSnapshot().activeId, 'clip-1');
  assert.equal(r.rows[0]!.status, 'pending');
  await r.controller.select(null);
  assert.equal(r.controller.getSnapshot().phase, 'cleanup');
  r.session.audio!.releaseCapture = release;
  await r.controller.stop(); assert.equal(r.rows[0]!.status, 'saved');
  assert.equal(r.controller.getSnapshot().activeId, null);
});
test('failed startup cleanup retains Stop retry rather than hiding an uncertain recorder', async () => {
  const r = rig(); const start = r.session.audio!.start;
  r.session.audio!.start = async i => { await start(i); throw Error('unreleased startup'); };
  r.session.audio!.releaseCapture = async () => { throw Error('still held'); };
  await r.controller.select('moment-a'); await r.controller.record();
  assert.equal(r.controller.getSnapshot().phase, 'cleanup');
  assert.equal(r.controller.getSnapshot().activeId, 'clip-1');
});
test('playback startup cleanup failure exposes Stop retry and blocks new recording', async () => {
  const r = rig(); await r.controller.select('moment-a'); await r.controller.record(); await r.controller.stop();
  r.session.audio!.play = async () => { throw Error('startup'); };
  const stop = r.session.audio!.stopPlayback;
  r.session.audio!.stopPlayback = async () => { throw Error('release'); };
  await r.controller.play('clip-1');
  assert.equal(r.controller.getSnapshot().phase, 'cleanup');
  assert.equal(r.controller.getSnapshot().activeId, 'clip-1');
  await r.controller.record(); assert.equal(r.rows.length, 1);
  r.session.audio!.stopPlayback = stop; await r.controller.stop();
  assert.equal(r.controller.getSnapshot().phase, 'ready');
});
