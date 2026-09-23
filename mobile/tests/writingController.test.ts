import assert from 'node:assert/strict';
import test from 'node:test';
import { createWritingController, findOpeningWriting } from '../src/journal/writingController.ts';
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
