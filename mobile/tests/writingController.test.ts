import assert from 'node:assert/strict';
import test from 'node:test';
import { createWritingController, findOpeningWriting, findWritingById } from '../src/journal/writingController.ts';
import type { TradingRepository, Writing } from '../src/storage/tradingTypes.ts';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function rig() {
  const saved: Writing[] = [];
  const repository = {
    saveDraft: async (row: Writing) => { saved.push(row); return row; },
    finalise: async (id: string, text: string, revision: number, at: string) => ({ ...saved.at(-1)!, id, text, revision, finalisedAt: at }),
    discardDraft: async () => {},
  } as unknown as TradingRepository;
  const controller = createWritingController({ repository: async () => repository, id: () => 'writing-1', now: () => '2026-09-23T10:00:00.000Z' });
  return { saved, repository, controller };
}

test('autosave snapshots edits and delayed completion never replaces newer input', async () => {
  const r = rig(); const first = deferred<Writing>();
  r.repository.saveDraft = async row => row.text === 'a' ? first.promise : row;
  r.controller.open({ kind: 'moment', id: 'm' }, 'note');
  const one = r.controller.edit('a'); const two = r.controller.edit('ab');
  first.resolve({ ...r.controller.getSnapshot().writing!, text: 'a' });
  await Promise.all([one, two]);
  assert.equal(r.controller.getSnapshot().text, 'ab');
  assert.equal(r.controller.getSnapshot().status, 'Saved draft');
});

test('Done flushes latest input and finalises once', async () => {
  const r = rig(); r.controller.open({ kind: 'moment', id: 'm' }, 'note');
  void r.controller.edit('first'); void r.controller.edit('latest');
  await Promise.all([r.controller.done(), r.controller.done()]);
  assert.equal(r.saved.at(-1)?.text, 'latest');
  assert.equal(r.controller.getSnapshot().writing?.finalisedAt, '2026-09-23T10:00:00.000Z');
});

test('empty Done explains required text', async () => {
  const r = rig(); r.controller.open({ kind: 'moment', id: 'm' }, 'note'); await r.controller.done();
  assert.match(r.controller.getSnapshot().error!, /text/i);
  assert.equal(r.controller.getSnapshot().writing?.finalisedAt, null);
});

test('failed discard keeps editable draft for retry', async () => {
  const r = rig(); r.controller.open({ kind: 'moment', id: 'm' }, 'note'); await r.controller.edit('keep this');
  r.repository.discardDraft = async () => { throw Error('private path'); };
  await r.controller.discard();
  assert.equal(r.controller.getSnapshot().text, 'keep this');
  assert.ok(r.controller.getSnapshot().writing);
  assert.match(r.controller.getSnapshot().error!, /try again/i);
});

test('background flush retries a save that fails after departure', async () => {
  const r = rig(); const first = deferred<Writing>(); let calls = 0;
  r.repository.saveDraft = async row => { if (++calls === 1) return first.promise; return row; };
  r.controller.open({ kind: 'moment', id: 'm' }, 'note');
  void r.controller.edit('latest');
  const flush = r.controller.background();
  first.reject(Error('storage failure'));
  await flush;
  assert.equal(r.controller.getSnapshot().status, 'Saved draft');
  assert.equal(calls, 2);
});

test('opening an original note searches older pages beyond newer reflections', async () => {
  const r = rig();
  const owner = { kind: 'moment' as const, id: 'm' };
  const reflection = Array.from({ length: 30 }, (_, index) => ({ id: `r-${index}`, owner, kind: 'reflection' as const, text: '', createdAt: '2026-09-23T10:00:00.000Z', updatedAt: '2026-09-23T10:00:00.000Z', finalisedAt: null, revision: 1 }));
  const note = { ...reflection[0]!, id: 'note', kind: 'note' as const, text: 'original' };
  r.repository.writings = async (_owner, before) => before ? [note] : reflection;
  assert.equal((await findOpeningWriting(r.repository, owner, 'note', reflection))?.text, 'original');
});

test('failed save blocks switching writing until retry preserves latest text', async () => {
  const r = rig(); r.repository.saveDraft = async () => { throw Error('fail'); };
  r.controller.open({ kind: 'moment', id: 'm' }, 'note'); await r.controller.edit('unsaved latest');
  const switched = r.controller.open({ kind: 'moment', id: 'other' }, 'reflection');
  assert.equal(switched, false);
  assert.equal(r.controller.getSnapshot().text, 'unsaved latest');
  assert.equal(r.controller.getSnapshot().writing?.owner.id, 'm');
});

test('pending discard refuses owner switch until it completes', async () => {
  const r = rig(); const removal = deferred<void>(); r.repository.discardDraft = () => removal.promise;
  r.controller.open({ kind: 'moment', id: 'first' }, 'note'); await r.controller.edit('old');
  const discard = r.controller.discard();
  assert.equal(r.controller.open({ kind: 'moment', id: 'second' }, 'note'), false);
  removal.resolve(); await discard;
  r.controller.open({ kind: 'moment', id: 'second' }, 'note'); await r.controller.edit('new');
  assert.equal(r.controller.getSnapshot().text, 'new');
  assert.equal(r.controller.getSnapshot().writing?.owner.id, 'second');
});

test('Done retries failed queued save and finalises latest text once', async () => {
  const r = rig(); const first = deferred<Writing>(); let saves = 0; let finalises = 0;
  r.repository.saveDraft = async row => ++saves === 1 ? first.promise : row;
  r.repository.finalise = async (id, text, revision, at) => { ++finalises; return { ...r.controller.getSnapshot().writing!, id, text, revision, finalisedAt: at }; };
  r.controller.open({ kind: 'moment', id: 'm' }, 'note'); void r.controller.edit('latest');
  const done = r.controller.done(); first.reject(Error('storage fail')); await done;
  assert.equal(r.controller.getSnapshot().status, 'Finalised');
  assert.equal(saves, 2); assert.equal(finalises, 1);
});

test('selection resolves latest persisted revision instead of stale list row', async () => {
  const r = rig(); const owner = { kind: 'moment' as const, id: 'm' };
  const stale: Writing = { id: 'reflection', owner, kind: 'reflection', text: 'old', createdAt: '2026-09-23T10:00:00.000Z', updatedAt: '2026-09-23T10:00:00.000Z', finalisedAt: null, revision: 1 };
  r.repository.writings = async () => [{ ...stale, text: 'latest', revision: 2 }];
  assert.equal((await findWritingById(r.repository, owner, stale.id))?.text, 'latest');
});

test('late original-note lookup cannot reopen an old owner', async () => {
  const r = rig(); const oldOwner = { kind: 'moment' as const, id: 'old' }; const delayed = deferred<Writing[]>();
  r.repository.writings = () => delayed.promise;
  r.controller.open(oldOwner, 'note'); const version = r.controller.version();
  const lookup = r.repository.writings(oldOwner);
  r.controller.open({ kind: 'moment', id: 'new' }, 'note');
  delayed.resolve([{ id: 'old-note', owner: oldOwner, kind: 'note', text: 'old', createdAt: '2026-09-23T10:00:00.000Z', updatedAt: '2026-09-23T10:00:00.000Z', finalisedAt: null, revision: 1 }]);
  const found = (await lookup)[0];
  assert.equal(r.controller.openIfCurrent(version, oldOwner, 'note', found), false);
  assert.equal(r.controller.getSnapshot().writing?.owner.id, 'new');
});

test('owner switch is refused while Done is finalising', async () => {
  const r = rig(); const finish = deferred<Writing>();
  r.repository.finalise = () => finish.promise;
  r.controller.open({ kind: 'moment', id: 'first' }, 'note'); await r.controller.edit('finished');
  const done = r.controller.done(); await Promise.resolve();
  assert.equal(r.controller.canSwitch({ kind: 'moment', id: 'second' }, 'note'), false);
  assert.equal(r.controller.open({ kind: 'moment', id: 'second' }, 'note'), false);
  assert.equal(r.controller.getSnapshot().writing?.owner.id, 'first');
  finish.resolve({ ...r.controller.getSnapshot().writing!, finalisedAt: '2026-09-23T10:00:00.000Z' }); await done;
});

test('edit during pending discard cannot recreate text that discard clears', async () => {
  const r = rig(); const removal = deferred<void>(); r.repository.discardDraft = () => removal.promise;
  r.controller.open({ kind: 'moment', id: 'first' }, 'note'); await r.controller.edit('old');
  const discard = r.controller.discard();
  await r.controller.edit('typed during discard');
  assert.equal(r.controller.getSnapshot().text, 'old');
  assert.equal(r.controller.canSwitch({ kind: 'moment', id: 'second' }, 'note'), false);
  removal.resolve(); await discard;
  assert.equal(r.controller.getSnapshot().writing, null);
});
