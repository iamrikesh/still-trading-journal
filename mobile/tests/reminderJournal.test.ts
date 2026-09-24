import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, moment } from './helpers/clipFixture.ts';
import { createJournalSession } from '../src/storage/journalSession.ts';
import { emotions } from '../src/journal/emotions.ts';
import type { NativeClipVault } from '../src/storage/nativeClipVault.ts';
import type { EmotionCard, ReminderAttachment } from '../src/storage/reminderTypes.ts';

const options = { debug: false, id: () => 'fixture-id', now: () => '2026-09-24T00:00:00.000Z' };
function native(f: Awaited<ReturnType<typeof fixture>>): NativeClipVault {
  return Object.assign(f.vault, {
    async initialize() {}, async verify() { throw Error('unused'); },
    async prepareFixture() { throw Error('unused'); },
    async inspect() { return { staging: false, final: false, pending: false, verification: false }; },
  }) as NativeClipVault;
}
function attachment(id: string, bytes = 3): ReminderAttachment {
  return { id, kind: 'image', mime: 'image/png', bytes, base64: Buffer.alloc(bytes, 1).toString('base64'), width: 1, height: 1, durationMs: null };
}
function custom(id: string): EmotionCard {
  return { id, label: 'Custom', hint: '', symbol: '·', support: 'Pause.', action: '', position: 6, archived: false, revision: 0, imageId: null, audioId: null };
}

test('session migrates to schema4, seeds six cards once and persists appearance across reopen', async () => {
  const f = await fixture();
  try {
    let session = await createJournalSession(f.db, native(f), options);
    assert.ok(session.reminders);
    assert.ok(session.appearance);
    assert.equal(f.sqlite.prepare('PRAGMA user_version').get()!.user_version, 4);
    assert.deepEqual((await session.reminders.list()).map(card => card.id), emotions.map(emotion => emotion.id));
    assert.equal(await session.appearance.get(), 'system');
    await session.appearance.set('dark');
    await session.reminders.save({ card: custom('custom') });
    f.reopen(); session = await createJournalSession(f.db, native(f), options);
    assert.deepEqual((await session.reminders!.list()).map(card => card.id), [...emotions.map(emotion => emotion.id), 'custom']);
    assert.equal(await session.appearance!.get(), 'dark');
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM emotion_cards').get()!.n, 7);
  } finally { f.close(); }
});

test('save atomically replaces payload, retries identically, and rejects stale differing data', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    const original = (await s.reminders!.list())[0]!;
    const first = await s.reminders!.save({ card: { ...original, support: '' }, image: attachment('image-a') });
    assert.equal(first.revision, 1);
    assert.equal(first.imageId, 'image-a');
    assert.deepEqual(await s.reminders!.attachment('image-a'), attachment('image-a'));
    assert.deepEqual(await s.reminders!.save({ card: { ...original, support: '' }, image: attachment('image-a') }), first);
    await assert.rejects(s.reminders!.save({ card: { ...original, label: 'Stale' } }));
    f.inject(sql => { if (sql.startsWith('UPDATE emotion_cards')) throw Error('injected SQL failure'); });
    await assert.rejects(s.reminders!.save({ card: { ...first, support: 'Updated' }, image: attachment('image-b') }));
    f.inject();
    assert.equal((await s.reminders!.attachment('image-b')), null);
    assert.equal((await s.reminders!.attachment('image-a'))?.bytes, 3);
    const next = await s.reminders!.save({ card: { ...first, support: 'Updated' }, image: attachment('image-b') });
    assert.equal(next.imageId, 'image-b');
    assert.equal(await s.reminders!.attachment('image-a'), null);
    assert.equal(await s.reminders!.usage(), 3);
  } finally { f.close(); }
});

test('invalid attachments and quota errors retain the saved card and payload', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    const initial = (await s.reminders!.list())[0]!;
    const saved = await s.reminders!.save({ card: initial, image: attachment('image-a') });
    for (const image of [
      { ...attachment('wrong'), kind: 'audio' },
      { ...attachment('bad64'), base64: 'AQI=' },
      { ...attachment('bad-id'), bytes: 2 },
      { ...attachment('bad/id') },
    ]) await assert.rejects(s.reminders!.save({ card: saved, image: image as ReminderAttachment }));
    const insert = f.sqlite.prepare('INSERT INTO reminder_payloads(id,kind,mime,bytes,base64,width,height,durationMs) VALUES (?,?,?,?,?,?,?,?)');
    const full = Buffer.alloc(4194304, 1).toString('base64');
    for (let i = 0; i < 7; i++) insert.run(`synthetic-${i}`, 'audio', 'audio/wav', 4194304, full, null, null, 240000);
    insert.run('synthetic-7', 'audio', 'audio/wav', 4194301, Buffer.alloc(4194301, 1).toString('base64'), null, null, 240000);
    await assert.rejects(s.reminders!.save({ card: saved, image: attachment('image-b', 4) }));
    assert.equal((await s.reminders!.list())[0]!.imageId, 'image-a');
    assert.equal(await s.reminders!.attachment('image-b'), null);
  } finally { f.close(); }
});

test('moving and archiving keep stable IDs, one active card and old moment snapshots', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    const before = await s.reminders!.list();
    await s.reminders!.move('hesitation', 'up');
    assert.deepEqual((await s.reminders!.list()).slice(0, 2).map(card => card.id), ['hesitation', 'fomo']);
    for (const card of before.slice(1)) await s.reminders!.archive(card.id, true);
    await assert.rejects(s.reminders!.archive('fomo', true));
    await s.reminders!.archive('hesitation', false);
    assert.equal((await s.reminders!.list()).length, 2);
    assert.equal((await s.reminders!.list(true)).length, 4);
    assert.deepEqual((await s.journal.list())[0], moment());
  } finally { f.close(); }
});

test('native history pages over tied timestamps without losing old or unusual IDs', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    for (let i = 0; i < 106; i++) await s.journal.save(moment(String(i).padStart(3, '0')));
    await s.journal.save(moment(''));
    const first = await s.journal.list();
    const second = await s.journal.list({ createdAt: first[49]!.createdAt, id: first[49]!.id });
    const third = await s.journal.list({ createdAt: second[49]!.createdAt, id: second[49]!.id });
    assert.equal(first.length, 50); assert.equal(second.length, 50);
    assert.equal(new Set([...first, ...second, ...third].map(row => row.id)).size, 108);
    assert.equal(third.at(-1)!.id, '');
  } finally { f.close(); }
});

test('identical new-card retry is stable and the 41st definition is rejected', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    const first = await s.reminders!.save({ card: custom('custom-0') });
    assert.deepEqual(await s.reminders!.save({ card: custom('custom-0') }), first);
    for (let i = 1; i < 34; i++) await s.reminders!.save({ card: custom(`custom-${i}`) });
    await assert.rejects(s.reminders!.save({ card: custom('custom-34') }));
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM emotion_cards').get()!.n, 40);
    await assert.rejects(s.reminders!.save({ card: { ...first, label: ' ' } }));
    await assert.rejects(s.reminders!.save({ card: { ...first, hint: 'x'.repeat(121) } }));
    await assert.rejects(s.reminders!.save({ card: { ...first, support: '' } }));
  } finally { f.close(); }
});

test('metadata list avoids payload columns and queued Save owns an input snapshot', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    const starter = (await s.reminders!.list())[0]!;
    let release!: () => void; let arrived!: () => void;
    const entered = new Promise<void>(resolve => { arrived = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const intent = { id: 'clip-queued', momentId: 'moment-1', createdAt: '2026-09-24T00:00:00.000Z' };
    f.vault.seed(intent);
    await s.clips!.begin(intent);
    f.vault.onSeal = async () => { arrived(); await gate; };
    const finishing = s.clips!.finish(intent.id);
    await entered;
    const image = attachment('owned-image');
    const draft = { card: { ...starter, label: 'Owned' }, image };
    const saving = s.reminders!.save(draft);
    draft.card.label = 'Mutated'; image.base64 = 'not base64'; image.id = 'other';
    release(); await Promise.all([finishing, saving]);
    f.inject(sql => { if (sql.startsWith('SELECT') && sql.includes('base64')) throw Error('payload loaded in metadata query'); });
    assert.equal((await s.reminders!.list())[0]!.label, 'Owned');
    assert.equal((await s.reminders!.list())[0]!.imageId, 'owned-image');
    assert.equal((await s.journal.list())[0]!.id, 'moment-1');
  } finally { f.close(); }
});

test('schema3 upgrade rolls back seed, tables and version on commit failure', async () => {
  const f = await fixture();
  try {
    await createJournalSession(f.db, native(f), options);
    f.sqlite.exec('DROP TABLE emotion_cards; DROP TABLE reminder_payloads; DROP TABLE appearance_preference; PRAGMA user_version = 3');
    f.reopen();
    f.inject(sql => { if (sql === 'COMMIT') throw Error('commit fault'); });
    await assert.rejects(createJournalSession(f.db, native(f), options));
    assert.equal(f.sqlite.prepare('PRAGMA user_version').get()!.user_version, 3);
    for (const name of ['emotion_cards', 'reminder_payloads', 'appearance_preference'])
      assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM sqlite_master WHERE name=?').get(name)!.n, 0);
    f.reopen();
    const s = await createJournalSession(f.db, native(f), options);
    assert.equal((await s.reminders!.list()).length, 6);
    assert.equal((await s.journal.list())[0]!.id, 'moment-1');
  } finally { f.close(); }
});

test('failed appearance write preserves durable selection', async () => {
  const f = await fixture();
  try {
    let s = await createJournalSession(f.db, native(f), options);
    await s.appearance!.set('light');
    f.inject(sql => { if (sql.startsWith('UPDATE appearance_preference')) throw Error('private write failure'); });
    await assert.rejects(s.appearance!.set('dark'));
    f.reopen(); s = await createJournalSession(f.db, native(f), options);
    assert.equal(await s.appearance!.get(), 'light');
    await assert.rejects(s.appearance!.set('blue' as 'dark'));
  } finally { f.close(); }
});
