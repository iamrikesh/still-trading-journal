import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreSupport } from '../src/journal/navigation.ts';
import { createAppearanceController, createCoordinatedRecordingController, createReminderController } from '../src/reminders/controller.ts';
import type { ImportedReminder, NativeReminders } from '../src/reminders/nativeReminders.ts';
import type { Appearance, EmotionCard, ReminderAttachment, ReminderRepository } from '../src/storage/reminderTypes.ts';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const image: ImportedReminder = { kind: 'image', mime: 'image/png', bytes: 3, base64: 'AQID', width: 1, height: 1, durationMs: null };
const audio: ImportedReminder = { kind: 'audio', mime: 'audio/wav', bytes: 3, base64: 'AQID', width: null, height: null, durationMs: 1000 };
const card = (id = 'one'): EmotionCard => ({ id, label: 'One', hint: 'Hint', symbol: '•', support: 'Breathe', action: 'Pause', position: 0, archived: false, revision: 0, imageId: null, audioId: null });

function rig() {
  const cards = [card()];
  const attachments = new Map<string, ReminderAttachment>();
  let picked: Promise<ImportedReminder | null> = Promise.resolve(null);
  let failSave = false;
  let failPick = false;
  let release = true;
  let stopCount = 0;
  const plays: string[] = [];
  const saves: { card: EmotionCard; image?: ReminderAttachment | null; audio?: ReminderAttachment | null }[] = [];
  let counter = 0;
  const repository: ReminderRepository = {
    async list(archived = false) { return cards.filter(row => row.archived === archived).map(row => ({ ...row })); },
    async save(input) {
      saves.push(input);
      if (failSave) throw Error('private/sql');
      const result = { ...input.card, revision: cards.some(row => row.id === input.card.id) ? input.card.revision + 1 : 0 };
      const old = cards.findIndex(row => row.id === result.id);
      for (const [kind, value] of [['image', input.image], ['audio', input.audio]] as const) {
        if (value === undefined) continue;
        if (value) attachments.set(value.id, value);
        const prior = old >= 0 ? cards[old]![kind === 'image' ? 'imageId' : 'audioId'] : null;
        if (prior && prior !== value?.id) attachments.delete(prior);
        result[kind === 'image' ? 'imageId' : 'audioId'] = value?.id ?? null;
      }
      if (old >= 0) cards[old] = result; else cards.push(result);
      return { ...result };
    },
    async move(id, direction) { const row = cards.find(item => item.id === id)!; row.position += direction === 'up' ? -1 : 1; },
    async archive(id, archived) { cards.find(item => item.id === id)!.archived = archived; },
    async attachment(id) { return attachments.get(id) ?? null; },
    async usage() { return 0; },
  };
  const native: NativeReminders = {
    async pick() { if (failPick) throw Error('private/uri'); return picked; },
    async play(base64) { plays.push(base64); },
    async stop() { stopCount++; },
    async status() { return { state: 'idle', durationMs: 0 }; },
  };
  const controller = createReminderController({ repository: async () => repository, native, recording: { stopForSessionEnd: async () => release }, id: () => `id-${++counter}` });
  return { controller, cards, attachments, saves, plays, repository, native, pick: (value: Promise<ImportedReminder | null>) => { picked = value; }, failSave: (value: boolean) => { failSave = value; }, failPick: (value: boolean) => { failPick = value; }, release: (value: boolean) => { release = value; }, stops: () => stopCount };
}

test('returning from writing restores reminder attachments without another capture or autoplay', async () => {
  const r = rig();
  r.cards[0]!.imageId = 'image'; r.cards[0]!.audioId = 'audio';
  r.attachments.set('image', { ...image, id: 'image' });
  r.attachments.set('audio', { ...audio, id: 'audio' });
  await r.controller.refresh();
  await r.controller.selectSupport(r.cards[0]!);
  r.controller.leaveSupport();
  assert.equal(r.controller.getSnapshot().selected, null);
  await restoreSupport(r.controller, 'one');
  assert.equal(r.controller.getSnapshot().selected?.audioId, 'audio');
  assert.equal(r.controller.getSnapshot().supportImage?.id, 'image');
  assert.equal(r.saves.length, 0);
  assert.equal(r.plays.length, 0);
});

test('editor Cancel keeps the saved card, while Save publishes complete draft', async () => {
  const r = rig(); await r.controller.refresh();
  r.controller.edit(r.cards[0]!); r.controller.change('label', 'Changed');
  assert.equal(r.controller.getSnapshot().dirty, true);
  r.controller.discard();
  assert.equal(r.cards[0]!.label, 'One'); assert.equal(r.saves.length, 0);
  r.controller.edit(r.cards[0]!); r.controller.change('label', 'Changed');
  await r.controller.save();
  assert.equal(r.cards[0]!.label, 'Changed'); assert.equal(r.controller.getSnapshot().draft, null);
});

test('late image import cannot replace the next editor owner', async () => {
  const r = rig(); await r.controller.refresh(); const picker = deferred<ImportedReminder | null>();
  r.controller.edit(r.cards[0]!); r.pick(picker.promise); const importing = r.controller.importMedia('image');
  r.controller.discard(); r.controller.add();
  picker.resolve(image); await importing;
  assert.equal(r.controller.getSnapshot().draft?.image, undefined);
});

test('failed replacement and cancelled picker retain the earlier draft media', async () => {
  const r = rig(); await r.controller.refresh(); r.controller.edit(r.cards[0]!);
  r.pick(Promise.resolve(image)); await r.controller.importMedia('image');
  const earlier = r.controller.getSnapshot().draft!.image;
  r.failPick(true); await r.controller.importMedia('image');
  assert.deepEqual(r.controller.getSnapshot().draft!.image, earlier);
  assert.match(r.controller.getSnapshot().error!, /import/i);
  r.failPick(false); r.pick(Promise.resolve(null)); await r.controller.importMedia('image');
  assert.deepEqual(r.controller.getSnapshot().draft!.image, earlier);
});

test('failed Save preserves edits and stable attachment ID for identical retry', async () => {
  const r = rig(); await r.controller.refresh(); r.controller.edit(r.cards[0]!);
  r.controller.change('support', 'Hold still'); r.pick(Promise.resolve(image)); await r.controller.importMedia('image');
  r.failSave(true); await r.controller.save();
  assert.equal(r.controller.getSnapshot().draft?.card.support, 'Hold still');
  assert.match(r.controller.getSnapshot().error!, /not saved/i);
  const id = r.saves[0]!.image?.id;
  r.failSave(false); await r.controller.save();
  assert.equal(r.saves[1]!.image?.id, id); assert.equal(r.cards[0]!.support, 'Hold still');
});

test('audio is fetched and played only after explicit Play and confirmed journal release', async () => {
  const r = rig(); r.cards[0]!.audioId = 'sound-1'; r.attachments.set('sound-1', { ...audio, id: 'sound-1' });
  await r.controller.refresh(); await r.controller.selectSupport(r.cards[0]!);
  assert.deepEqual(r.plays, []);
  r.release(false); await r.controller.play(); assert.deepEqual(r.plays, []);
  r.release(true); await r.controller.play(); assert.deepEqual(r.plays, ['AQID']);
});

test('navigation and background revoke pending Play before native starts', async () => {
  const r = rig(); r.cards[0]!.audioId = 'sound-1';
  const fetch = deferred<ReminderAttachment | null>(); r.repository.attachment = () => fetch.promise;
  await r.controller.refresh(); await r.controller.selectSupport(r.cards[0]!);
  const playing = r.controller.play(); r.controller.leaveSupport();
  fetch.resolve({ ...audio, id: 'sound-1' }); await playing;
  assert.deepEqual(r.plays, []); assert.ok(r.stops() > 0);
  await r.controller.selectSupport(r.cards[0]!);
  const next = deferred<ReminderAttachment | null>(); r.repository.attachment = () => next.promise;
  const afterBackground = r.controller.play(); r.controller.background();
  next.resolve({ ...audio, id: 'sound-1' }); await afterBackground;
  assert.deepEqual(r.plays, []);
});

test('new editor cannot play audio from a previously selected card', async () => {
  const r = rig(); r.cards[0]!.audioId = 'sound-1'; r.attachments.set('sound-1', { ...audio, id: 'sound-1' });
  await r.controller.refresh(); await r.controller.selectSupport(r.cards[0]!);
  r.controller.add(); await r.controller.play();
  assert.deepEqual(r.plays, []);
});

test('pending Stop settles before a new Play and a late Stop cannot erase playback status', async () => {
  const stop = deferred<void>(); let stopCalls = 0;
  // The initial selection Stop owns admission even when the bridge resolves later.
  const rig2 = rig(); rig2.cards[0]!.audioId = 'sound-1'; rig2.attachments.set('sound-1', { ...audio, id: 'sound-1' });
  const originalStop = rig2.native.stop;
  rig2.native.stop = async () => { stopCalls++; if (stopCalls === 1) return stop.promise; return originalStop(); };
  await rig2.controller.refresh(); await rig2.controller.selectSupport(rig2.cards[0]!);
  const playing = rig2.controller.play();
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(rig2.plays, []);
  stop.resolve(); await playing;
  assert.deepEqual(rig2.plays, ['AQID']); assert.equal(rig2.controller.getSnapshot().playing, 'playing');
});

test('repeated Stop while native cleanup is pending shares one release', async () => {
  const r = rig(); const release = deferred<void>(); let calls = 0;
  r.native.stop = async () => { calls++; await release.promise; };
  const first = r.controller.stop(); const second = r.controller.stop();
  assert.equal(calls, 1);
  release.resolve(); assert.equal(await first, true); assert.equal(await second, true);
  assert.equal(r.controller.getSnapshot().playing, 'idle');
});

test('repeated Play keeps the first audio active and Stop reachable', async () => {
  const r = rig(); r.cards[0]!.audioId = 'sound-1'; r.attachments.set('sound-1', { ...audio, id: 'sound-1' });
  let nativePlaying = false; let playCalls = 0; let statusCalls = 0;
  r.native.play = async () => { playCalls++; if (nativePlaying) throw Error('already playing'); nativePlaying = true; };
  r.native.stop = async () => { nativePlaying = false; };
  r.native.status = async () => { statusCalls++; return { state: nativePlaying ? 'playing' : 'idle', durationMs: 1000 }; };
  await r.controller.refresh(); await r.controller.selectSupport(r.cards[0]!);
  await r.controller.play(); await r.controller.play(); await r.controller.poll();
  assert.equal(playCalls, 1); assert.equal(statusCalls, 1);
  assert.equal(r.controller.getSnapshot().playing, 'playing');
  assert.equal(nativePlaying, true);
  await r.controller.stop(); assert.equal(nativePlaying, false);
});

test('failed old status poll cannot replace confirmed Stop or a newer Play', async () => {
  const r = rig(); r.cards[0]!.audioId = 'sound-1'; r.attachments.set('sound-1', { ...audio, id: 'sound-1' });
  let rejectOld!: (reason: Error) => void;
  r.native.status = () => new Promise((_, reject) => { rejectOld = reject; });
  await r.controller.refresh(); await r.controller.selectSupport(r.cards[0]!);
  await r.controller.play();
  const oldPoll = r.controller.poll();
  await r.controller.stop();
  assert.equal(r.controller.getSnapshot().playing, 'idle');
  await r.controller.play();
  assert.equal(r.controller.getSnapshot().playing, 'playing');
  rejectOld(Error('old status read failed')); await oldPoll;
  assert.equal(r.controller.getSnapshot().playing, 'playing');
  assert.equal(r.controller.getSnapshot().error, null);
});

test('failed native start with unconfirmed release keeps cleanup reachable through retry', async () => {
  const r = rig(); r.cards[0]!.audioId = 'sound-1'; r.attachments.set('sound-1', { ...audio, id: 'sound-1' });
  let failPlay = true; let failRelease = false; let nativeState: 'idle' | 'playing' | 'cleanup' = 'idle';
  r.native.play = async () => { if (failPlay) { nativeState = 'cleanup'; throw Error('private/temporary'); } nativeState = 'playing'; };
  r.native.stop = async () => { if (failRelease) throw Error('private/release'); nativeState = 'idle'; };
  r.native.status = async () => ({ state: nativeState, durationMs: 0 });
  await r.controller.refresh(); await r.controller.selectSupport(r.cards[0]!);
  failRelease = true; await r.controller.play();
  assert.equal(r.controller.getSnapshot().playing, 'cleanup');
  assert.match(r.controller.getSnapshot().error!, /release|Stop/i);
  failRelease = false; await r.controller.stop();
  assert.equal(r.controller.getSnapshot().playing, 'idle');
  failPlay = false; await r.controller.play();
  assert.equal(r.controller.getSnapshot().playing, 'playing');
});

test('failed native start with confirmed temporary cleanup permits an explicit retry', async () => {
  const r = rig(); r.cards[0]!.audioId = 'sound-1'; r.attachments.set('sound-1', { ...audio, id: 'sound-1' });
  let fails = 1; let stopCalls = 0;
  r.native.play = async () => { if (fails-- > 0) throw Error('private/file-cleanup'); };
  r.native.stop = async () => { stopCalls++; };
  await r.controller.refresh(); await r.controller.selectSupport(r.cards[0]!);
  const before = stopCalls; await r.controller.play();
  assert.equal(stopCalls, before + 1);
  assert.equal(r.controller.getSnapshot().playing, 'idle');
  assert.match(r.controller.getSnapshot().error!, /could not play/i);
  await r.controller.play(); assert.equal(r.controller.getSnapshot().playing, 'playing');
});

test('appearance latest choice survives a delayed load and ordered writes', async () => {
  const load = deferred<Appearance>(); const first = deferred<void>(); const writes: Appearance[] = [];
  const controller = createAppearanceController({ repository: async () => ({ get: () => load.promise, set: value => { writes.push(value); return value === 'light' ? first.promise : Promise.resolve(); } }) });
  const loading = controller.load(); const light = controller.choose('light'); const dark = controller.choose('dark');
  load.resolve('system'); await loading;
  assert.equal(controller.getSnapshot().value, 'dark');
  first.resolve(); await Promise.all([light, dark]);
  assert.deepEqual(writes, ['light', 'dark']); assert.equal(controller.getSnapshot().status, 'saved');
});

test('failed appearance choice remains active with Retry', async () => {
  let failing = true; const writes: Appearance[] = [];
  const controller = createAppearanceController({ repository: async () => ({ get: async () => 'system', set: async value => { writes.push(value); if (failing) throw Error('private/sql'); } }) });
  await controller.load(); await controller.choose('dark');
  assert.equal(controller.getSnapshot().value, 'dark'); assert.equal(controller.getSnapshot().status, 'failed');
  failing = false; await controller.retry();
  assert.deepEqual(writes, ['dark', 'dark']); assert.equal(controller.getSnapshot().status, 'saved');
});

test('appearance read failure can retry without overwriting saved choice', async () => {
  let failRead = true; let writes = 0;
  const controller = createAppearanceController({ repository: async () => ({ get: async () => { if (failRead) throw Error('read'); return 'dark'; }, set: async () => { writes++; } }) });
  await controller.load();
  assert.equal(controller.getSnapshot().status, 'loadFailed');
  failRead = false; await controller.load();
  assert.equal(controller.getSnapshot().value, 'dark'); assert.equal(writes, 0);
});

test('journal Record waits for confirmed reminder stop and drops stale navigation start', async () => {
  let owner: string | null = 'moment-a'; let started = 0; let allow = true;
  const stop = deferred<boolean>();
  const base = { getSnapshot: () => ({ momentId: owner, phase: 'ready' }), record: async () => { started++; }, play: async (_id: string) => { started++; },
    select: async (id: string | null) => { owner = id; }, background: async () => {}, stop: async () => {}, stopForSessionEnd: async () => true };
  const wrapped = createCoordinatedRecordingController(base, { stop: () => allow ? stop.promise : Promise.resolve(false) });
  const recording = wrapped.record();
  await wrapped.select(null); stop.resolve(true); await recording;
  assert.equal(started, 0);
  owner = 'moment-a'; allow = false; await wrapped.play('clip-a');
  assert.equal(started, 0);
});

for (const kind of ['record', 'play'] as const) for (const cancellation of ['stop', 'stopForSessionEnd'] as const) {
  test(`journal ${kind} waiting for reminder release is revoked by ${cancellation}`, async () => {
    const release = deferred<boolean>(); let starts = 0; let baseEpoch = 0;
    const base = {
      getSnapshot: () => ({ momentId: 'moment-a', phase: 'ready' }),
      record: async () => { const token = baseEpoch; await Promise.resolve(); if (token === baseEpoch) starts++; },
      play: async (_id: string) => { const token = baseEpoch; await Promise.resolve(); if (token === baseEpoch) starts++; },
      select: async (_id: string | null) => { baseEpoch++; }, background: async () => { baseEpoch++; },
      stop: async () => { baseEpoch++; }, stopForSessionEnd: async () => { baseEpoch++; return true; },
    };
    const wrapped = createCoordinatedRecordingController(base, { stop: () => release.promise });
    const starting = kind === 'record' ? wrapped.record() : wrapped.play('clip-a');
    const cancelling = wrapped[cancellation]();
    await cancelling;
    release.resolve(true); await starting;
    assert.equal(starts, 0);
  });
}
