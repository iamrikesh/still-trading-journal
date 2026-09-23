import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, moment } from './helpers/clipFixture.ts';
import { createJournalSession } from '../src/storage/journalSession.ts';
import type { NativeClipVault } from '../src/storage/nativeClipVault.ts';
import type { Writing } from '../src/storage/tradingTypes.ts';

const at = '2026-09-23T10:00:00.000Z';
const options = { debug: false, id: () => 'fixture-id', now: () => at };
const later = '2026-09-23T11:00:00.000Z';
function native(f: Awaited<ReturnType<typeof fixture>>): NativeClipVault {
  return Object.assign(f.vault, {
    async initialize() {}, async verify() { throw Error('unused'); },
    async prepareFixture() { throw Error('unused'); },
    async inspect() { return { staging: false, final: false, pending: false, verification: false }; },
  }) as NativeClipVault;
}
function draft(id: string, owner: Writing['owner'] = { kind: 'moment', id: 'moment-1' }, kind: Writing['kind'] = 'note'): Writing {
  return { id, owner, kind, text: ' first  line\n', createdAt: at, updatedAt: at, finalisedAt: null, revision: 0 };
}

test('one active session survives a rejected concurrent start', async () => {
  const f = await fixture();
  try {
    const session = await createJournalSession(f.db, native(f), options);
    assert.ok(session.trading, 'trading repository must be available');
    const a = await session.trading.start({ id: 'session-a', title: '', at });
    await assert.rejects(session.trading.start({ id: 'session-b', title: '', at: '2026-09-23T10:01:00.000Z' }));
    assert.equal((await session.trading.active())?.id, a.id);
  } finally { f.close(); }
});

test('schema3 reopens with original boundaries and an active session', async () => {
  const f = await fixture();
  try {
    let s = await createJournalSession(f.db, native(f), options);
    await s.trading!.start({ id: 'session-a', title: '', at });
    assert.equal(f.sqlite.prepare('PRAGMA user_version').get()!.user_version, 3);
    f.reopen(); s = await createJournalSession(f.db, native(f), options);
    assert.equal((await s.trading!.active())?.id, 'session-a');
    await s.trading!.end('session-a', later);
    await s.trading!.end('session-a', '2026-09-23T12:00:00.000Z');
    await s.trading!.adjust('session-a', { title: 'Corrected', startedAt: '2026-09-23T09:00:00.000Z', endedAt: '2026-09-23T12:00:00.000Z', at: '2026-09-23T13:00:00.000Z' });
    const ended = (await s.trading!.sessions(false))[0]!;
    assert.equal(ended.originalStartedAt, at);
    assert.equal(ended.originalEndedAt, later);
    assert.equal(ended.startedAt, '2026-09-23T09:00:00.000Z');
    assert.equal(ended.endedAt, '2026-09-23T12:00:00.000Z');
    assert.equal(ended.adjustedAt, '2026-09-23T13:00:00.000Z');
    await assert.rejects(s.trading!.adjust('session-a', { title: '', startedAt: at, endedAt: null, at: later }));
    await s.trading!.archive('session-a', true, later);
    assert.deepEqual(await s.trading!.sessions(false), []);
    assert.equal((await s.trading!.sessions(true))[0]!.id, 'session-a');
    await s.trading!.archive('session-a', false, later);
    assert.equal((await s.trading!.sessions(false))[0]!.id, 'session-a');
    assert.equal(await s.trading!.active(), null);
  } finally { f.close(); }
});

test('new moments attach atomically to active session while immutable retries preserve membership', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    await s.trading!.start({ id: 'session-a', title: '', at });
    await s.journal.save(moment('new-moment'));
    assert.equal((await s.trading!.membership('new-moment'))?.id, 'session-a');
    await s.trading!.end('session-a', later);
    await s.trading!.start({ id: 'session-b', title: '', at: later });
    await s.journal.save({ ...moment('new-moment'), createdAt: later });
    assert.equal((await s.trading!.membership('new-moment'))?.id, 'session-a');
    assert.equal((await s.trading!.membership('moment-1')), null);
    await s.trading!.assign('new-moment', 'session-b');
    assert.equal((await s.trading!.timeline('session-b'))[0]!.createdAt, moment().createdAt);
    await s.trading!.assign('new-moment', null);
    assert.equal(await s.trading!.membership('new-moment'), null);
  } finally { f.close(); }
});

test('legacy moment IDs remain writable, movable and pageable as bound text', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    await s.trading!.start({ id: 'session-a', title: '', at });
    const ids = ["Legacy_1", "odd' text id"];
    for (const legacyId of ids) await s.journal.save({ ...moment(legacyId), createdAt: at });
    assert.equal((await s.trading!.membership('Legacy_1'))?.id, 'session-a');
    await s.trading!.saveDraft(draft('legacy-note', { kind: 'moment', id: "odd' text id" }));
    assert.equal((await s.trading!.writings({ kind: 'moment', id: "odd' text id" }))[0]!.text, ' first  line\n');
    const first = await s.trading!.timeline('session-a');
    assert.equal(first.length, 2);
    assert.deepEqual((await s.trading!.timeline('session-a', { at, id: first[0]!.id })).map(row => row.id), [first[1]!.id]);
    await s.trading!.end('session-a', later);
    await s.trading!.start({ id: 'session-b', title: '', at: later });
    await s.trading!.assign('Legacy_1', 'session-b');
    assert.equal((await s.trading!.membership('Legacy_1'))?.id, 'session-b');
    await s.trading!.assign("odd' text id", null);
    assert.equal(await s.trading!.membership("odd' text id"), null);
  } finally { f.close(); }
});

test('draft revisions, finalisation after End, and final text survive reopen', async () => {
  const f = await fixture();
  try {
    let s = await createJournalSession(f.db, native(f), options);
    await s.trading!.start({ id: 'session-a', title: '', at });
    const first = draft('writing-a');
    assert.deepEqual(await s.trading!.saveDraft(first), first);
    const next = { ...first, text: ' next ', updatedAt: later, revision: 1 };
    await s.trading!.saveDraft(next);
    await assert.rejects(s.trading!.saveDraft({ ...first, text: 'stale' }));
    await assert.rejects(s.trading!.saveDraft({ ...next, text: 'collision' }));
    await s.trading!.end('session-a', later);
    const doneAt = '2026-09-24T10:00:00.000Z';
    const finished = await s.trading!.finalise('writing-a', ' last\n', 2, doneAt);
    assert.equal(finished.text, ' last\n');
    assert.equal(finished.finalisedAt, doneAt);
    assert.deepEqual(await s.trading!.finalise('writing-a', ' last\n', 2, doneAt), finished);
    await assert.rejects(s.trading!.saveDraft({ ...next, revision: 3 }));
    await assert.rejects(s.trading!.finalise('writing-a', 'other', 3, doneAt));
    await s.trading!.discardDraft('writing-a');
    f.reopen(); s = await createJournalSession(f.db, native(f), options);
    assert.deepEqual(await s.trading!.writings({ kind: 'moment', id: 'moment-1' }), [finished]);
  } finally { f.close(); }
});

test('one note per moment and deletion intent hides writing until confirmed deletion cascades', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    await s.trading!.saveDraft(draft('note-a'));
    await assert.rejects(s.trading!.saveDraft(draft('note-b')));
    await s.trading!.saveDraft(draft('reflection-a', { kind: 'moment', id: 'moment-1' }, 'reflection'));
    await s.trading!.start({ id: 'session-a', title: '', at });
    await s.trading!.saveDraft(draft('reflection-b', { kind: 'session', id: 'session-a' }, 'reflection'));
    f.sqlite.exec("INSERT INTO moment_deletions(id) VALUES ('moment-1')");
    assert.deepEqual(await s.trading!.writings({ kind: 'moment', id: 'moment-1' }), []);
    await assert.rejects(s.trading!.saveDraft(draft('reflection-c', { kind: 'moment', id: 'moment-1' }, 'reflection')));
    await assert.rejects(s.trading!.assign('moment-1', 'session-a'));
    await assert.rejects(s.trading!.discardDraft('note-a'));
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM journal_writings WHERE momentId = ?').get('moment-1')!.n, 2);
    await s.journal.remove('moment-1');
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM journal_writings WHERE momentId = ?').get('moment-1')!.n, 0);
    assert.equal((await s.trading!.writings({ kind: 'session', id: 'session-a' })).length, 1);
  } finally { f.close(); }
});

test('finalisation cannot move before the durable draft edit or accept blank text', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    await s.trading!.saveDraft(draft('note-a'));
    await s.trading!.saveDraft({ ...draft('note-a'), text: 'new', updatedAt: later, revision: 1 });
    await assert.rejects(s.trading!.finalise('note-a', 'new', 1, at));
    await assert.rejects(s.trading!.finalise('note-a', '   \n', 2, later));
    assert.equal((await s.trading!.writings({ kind: 'moment', id: 'moment-1' }))[0]!.finalisedAt, null);
  } finally { f.close(); }
});

test('session and writing pages use stable descending time and ID ties', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    for (let i = 0; i < 32; i++) {
      const id = `session-${String(i).padStart(2, '0')}`;
      await s.trading!.start({ id, title: '', at });
      await s.trading!.end(id, later);
      await s.trading!.saveDraft(draft(`reflection-${String(i).padStart(2, '0')}`, { kind: 'session', id }, 'reflection'));
    }
    const first = await s.trading!.sessions(false);
    assert.equal(first.length, 30);
    assert.equal(first[0]!.id, 'session-31');
    assert.equal(first[29]!.id, 'session-02');
    assert.deepEqual((await s.trading!.sessions(false, { at, id: 'session-02' })).map(row => row.id), ['session-01', 'session-00']);
    for (let i = 0; i < 32; i++) await s.trading!.saveDraft(draft(`follow-${String(i).padStart(2, '0')}`, { kind: 'moment', id: 'moment-1' }, 'reflection'));
    const writings = await s.trading!.writings({ kind: 'moment', id: 'moment-1' });
    assert.equal(writings.length, 30);
    assert.equal(writings[0]!.id, 'follow-31');
    assert.deepEqual((await s.trading!.writings({ kind: 'moment', id: 'moment-1' }, { at, id: 'follow-02' })).map(row => row.id), ['follow-01', 'follow-00']);
  } finally { f.close(); }
});

test('writing pages use owner indexes for their finalisation-aware order', async () => {
  const f = await fixture();
  try {
    await createJournalSession(f.db, native(f), options);
    for (const column of ['momentId', 'sessionId']) {
      const steps = f.sqlite.prepare(`EXPLAIN QUERY PLAN SELECT id FROM journal_writings WHERE ${column} = ?
        ORDER BY COALESCE(finalisedAt, updatedAt) DESC, id DESC LIMIT 30`).all('owner') as { detail: string }[];
      assert.equal(steps.some(step => step.detail.includes('USE TEMP B-TREE')), false, column);
    }
  } finally { f.close(); }
});

test('failed schema2 upgrade rolls back tables and version, then reopens', async () => {
  const f = await fixture();
  try {
    await createJournalSession(f.db, native(f), options);
    f.sqlite.exec('DROP TABLE journal_writings; DROP TABLE trading_memberships; DROP TABLE trading_sessions; PRAGMA user_version = 2');
    f.sqlite.exec("INSERT INTO clip_tombstones(id) VALUES ('old-media')");
    f.reopen();
    let reachedMutatedSchema = false;
    f.inject(sql => {
      if (sql !== 'COMMIT') return;
      assert.equal(f.sqlite.prepare('PRAGMA user_version').get()!.user_version, 3);
      assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'journal_writings'").get()!.n, 1);
      reachedMutatedSchema = true;
      throw Error('injected commit fault');
    });
    await assert.rejects(createJournalSession(f.db, native(f), options));
    assert.equal(reachedMutatedSchema, true);
    assert.equal(f.sqlite.prepare('PRAGMA user_version').get()!.user_version, 2);
    for (const name of ['trading_sessions', 'trading_memberships', 'journal_writings', 'trading_one_active', 'trading_recent', 'trading_membership_timeline', 'writing_one_note', 'writing_moment_recent', 'writing_session_recent']) {
      assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM sqlite_master WHERE name = ?').get(name)!.n, 0, name);
    }
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM moments').get()!.n, 1);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM clip_tombstones WHERE id = 'old-media'").get()!.n, 1);
    f.reopen();
    const s = await createJournalSession(f.db, native(f), options);
    assert.ok(s.trading);
    assert.equal((await s.journal.list()).length, 1);
  } finally { f.close(); }
});

test('unknown schema and prior media evidence do not create another key', async () => {
  const f = await fixture();
  try {
    await createJournalSession(f.db, native(f), options);
    f.sqlite.exec('PRAGMA user_version = 4');
    f.reopen();
    await assert.rejects(createJournalSession(f.db, native(f), options));
    assert.equal(f.sqlite.prepare('PRAGMA user_version').get()!.user_version, 4);
    f.sqlite.exec("PRAGMA user_version = 3; INSERT INTO moment_tombstones(id) VALUES ('old-owner')");
    f.reopen();
    const vault = native(f);
    vault.initialize = async allow => { assert.equal(allow, false); throw Error('missing key'); };
    await assert.rejects(createJournalSession(f.db, vault, options));
  } finally { f.close(); }
});

test('failed automatic association rolls back the new moment', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    await s.trading!.start({ id: 'session-a', title: '', at });
    f.inject(sql => { if (sql.includes('INSERT INTO trading_memberships')) throw Error('association fault'); });
    await assert.rejects(s.journal.save(moment('new-moment')));
    f.inject();
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM moments WHERE id = ?').get('new-moment')!.n, 0);
    await s.journal.save(moment('new-moment'));
    assert.equal((await s.trading!.membership('new-moment'))?.id, 'session-a');
  } finally { f.close(); }
});

test('queued writing input is copied before a prior clip operation completes', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    const clip = { id: 'clip-a', momentId: 'moment-1', createdAt: at };
    f.vault.seed(clip);
    await s.clips!.begin(clip);
    let release!: () => void; let entered!: () => void;
    const arrived = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.vault.onSeal = async () => { entered(); await gate; };
    const finishing = s.clips!.finish('clip-a');
    await arrived;
    const input = draft('note-a');
    const saving = s.trading!.saveDraft(input);
    input.text = 'later mutation'; input.owner.id = 'missing';
    release();
    await Promise.all([finishing, saving]);
    assert.equal((await s.trading!.writings({ kind: 'moment', id: 'moment-1' }))[0]!.text, ' first  line\n');
  } finally { f.close(); }
});

test('failed moment file deletion retains hidden text until successful recovery', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    await s.trading!.saveDraft(draft('note-a'));
    const clip = { id: 'clip-a', momentId: 'moment-1', createdAt: at };
    f.vault.seed(clip); await s.clips!.begin(clip); await s.clips!.finish(clip.id);
    f.vault.failures.add('all:clip-a');
    await assert.rejects(s.journal.remove('moment-1'));
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM journal_writings').get()!.n, 1);
    assert.deepEqual(await s.trading!.writings({ kind: 'moment', id: 'moment-1' }), []);
    f.vault.failures.clear();
    await s.journal.remove('moment-1');
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM journal_writings').get()!.n, 0);
  } finally { f.close(); }
});

test('invalid boundaries, owners and writing identity leave stored state intact', async () => {
  const f = await fixture();
  try {
    const s = await createJournalSession(f.db, native(f), options);
    await assert.rejects(s.trading!.start({ id: 'bad/id', title: '', at }));
    await assert.rejects(s.trading!.start({ id: 'session-a', title: '', at: '2026-09-23' }));
    await s.trading!.start({ id: 'session-a', title: '', at });
    await assert.rejects(s.trading!.archive('session-a', true, later));
    await assert.rejects(s.trading!.end('session-a', '2026-09-23T09:59:59.000Z'));
    assert.equal((await s.trading!.active())?.id, 'session-a');
    await s.trading!.saveDraft(draft('note-a'));
    await assert.rejects(s.trading!.saveDraft({ ...draft('note-a'), owner: { kind: 'session', id: 'session-a' }, kind: 'reflection', revision: 1 }));
    await assert.rejects(s.trading!.saveDraft({ ...draft('note-a'), text: 'x'.repeat(20001), revision: 1 }));
    assert.equal((await s.trading!.writings({ kind: 'moment', id: 'moment-1' }))[0]!.text, ' first  line\n');
  } finally { f.close(); }
});
