import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { createClipJournal } from '../src/storage/clipJournal.ts';
import { fixture, FixtureVault, intent, moment } from './helpers/clipFixture.ts';

test('schema 1 migration preserves journal rows and commits several immutable clips', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    assert.deepEqual(await repo.journal.list(), [moment()]);
    assert.equal(f.sqlite.prepare('PRAGMA user_version').get()?.user_version, 2);
    assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
    for (const id of ['clip-1', 'clip-2']) {
      const owner = { ...intent, id };
      await repo.begin(owner); await repo.begin(owner); f.vault.seed(owner);
      await repo.finish(id); await repo.finish(id);
    }
    const clips = await repo.list(intent.momentId);
    assert.deepEqual(clips.map(c => [c.id, c.status, c.bytes, c.durationMs]), [
      ['clip-2', 'saved', 16, 1000], ['clip-1', 'saved', 16, 1000],
    ]);
    assert.equal(existsSync(f.vault.path(intent.id, 'staging')), false);
    assert.equal(existsSync(f.vault.path(intent.id, 'final')), true);
    await assert.rejects(repo.begin({ ...intent, momentId: 'different' }));
    await assert.rejects(repo.begin({ ...intent, createdAt: '2026-09-22T10:00:00.000Z' }));
    assert.deepEqual(await repo.recover(), { completed: 0, pending: 0 });
  } finally { f.close(); }
});

test('migration failure rolls back tables/version and unknown versions remain unchanged', async () => {
  const f = await fixture();
  try {
    f.inject(sql => { if (sql === 'COMMIT') throw new Error('private/path database detail'); });
    await assert.rejects(createClipJournal(f.db, f.vault), e => e instanceof Error && !e.message.includes('private') && !e.cause);
    assert.equal(f.sqlite.prepare('PRAGMA user_version').get()?.user_version, 1);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'clips'").get()?.n, 0);
    assert.deepEqual(await f.legacy.list(), [moment()]);
    f.inject();
    for (const version of [0, 5]) {
      f.sqlite.exec(`PRAGMA user_version = ${version}`);
      await assert.rejects(createClipJournal(f.db, f.vault));
      assert.equal(f.sqlite.prepare('PRAGMA user_version').get()?.user_version, version);
      assert.deepEqual(await f.legacy.list(), [moment()]);
    }
    f.sqlite.exec('PRAGMA user_version = 1');
    await createClipJournal(f.db, f.vault);
  } finally { f.close(); }
});

test('invalid clip identities/times and unsaved owners reject before creating files', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    for (const id of ['', '../escape', 'x'.repeat(65), 'emoji-😀', 'a.b', 'Clip-1', 'clip_1', "x';--"]) {
      await assert.rejects(repo.begin({ ...intent, id }));
      await assert.rejects(repo.finish(id));
      await assert.rejects(repo.remove(id));
    }
    for (const createdAt of ['today', '2026-02-30T10:00:00.000Z', '2026-09-21', '2026-09-21T10:00:00Z']) {
      await assert.rejects(repo.begin({ ...intent, createdAt }));
    }
    await assert.rejects(repo.begin({ ...intent, momentId: 'unsaved' }));
    const unusual = moment("owner'; नमस्ते");
    await repo.journal.save(unusual);
    await repo.begin({ ...intent, momentId: unusual.id });
    assert.equal((await repo.list(unusual.id))[0]?.momentId, unusual.id);
  } finally { f.close(); }
});

test('timestamp ties paginate twenty clips without duplicates or dropping older clips', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    for (let n = 0; n < 45; n++) await repo.begin({ ...intent, id: `c${String(n).padStart(2, '0')}` });
    const first = await repo.list(intent.momentId);
    const second = await repo.list(intent.momentId, first[19]);
    const third = await repo.list(intent.momentId, second[19]);
    assert.deepEqual([first.length, second.length, third.length], [20, 20, 5]);
    assert.deepEqual([first[0]?.id, first[19]?.id, second[0]?.id, third[4]?.id], ['c44', 'c25', 'c24', 'c00']);
    assert.equal(new Set([...first, ...second, ...third].map(c => c.id)).size, 45);
  } finally { f.close(); }
});

test('restart after seal but failed metadata commit preserves final and completes once', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent); f.vault.seed(intent);
    f.inject(sql => { if (sql === 'COMMIT') throw new Error('private database path'); });
    await assert.rejects(repo.finish(intent.id));
    assert.equal(existsSync(f.vault.path(intent.id, 'final')), true);
    assert.equal(existsSync(f.vault.path(intent.id, 'staging')), true);
    assert.equal((await repo.list(intent.momentId))[0]?.status, 'pending');
    f.reopen();
    const reopened = await createClipJournal(f.db, f.vault);
    assert.deepEqual(await reopened.recover(), { completed: 1, pending: 0 });
    assert.deepEqual((await reopened.list(intent.momentId)).map(c => c.status), ['saved']);
    assert.equal(existsSync(f.vault.path(intent.id, 'staging')), false);
    assert.deepEqual(await reopened.recover(), { completed: 0, pending: 0 });
  } finally { f.close(); }
});

test('cleanup failure persists and tampered final cannot be replaced by good staging', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent); f.vault.seed(intent);
    f.vault.failures.add('staging:clip-1');
    await assert.rejects(repo.finish(intent.id));
    assert.equal((await repo.list(intent.momentId))[0]?.status, 'cleanup-pending');
    const final = f.vault.path(intent.id, 'final');
    const original = readFileSync(final, 'utf8');
    writeFileSync(final, 'tampered synthetic final');
    f.reopen();
    const reopened = await createClipJournal(f.db, f.vault);
    assert.deepEqual(await reopened.recover(), { completed: 0, pending: 1 });
    assert.equal(readFileSync(final, 'utf8'), 'tampered synthetic final');
    assert.equal(existsSync(f.vault.path(intent.id, 'staging')), true);
    writeFileSync(final, original);
    assert.deepEqual(await reopened.recover(), { completed: 1, pending: 0 });
  } finally { f.close(); }
});

test('missing or invalid staging and out-of-bound metadata keep recovery records', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent);
    await assert.rejects(repo.finish(intent.id));
    writeFileSync(f.vault.path(intent.id, 'staging'), 'unfinished');
    await assert.rejects(repo.finish(intent.id));
    f.vault.seed({ ...intent, momentId: 'wrong owner' });
    await assert.rejects(repo.finish(intent.id));
    f.vault.seed(intent);
    for (const [bytes, durationMs] of [[0, 1], [4194305, 1], [1.5, 1], [NaN, 1], [1, 0], [1, 240001], [1, Infinity]]) {
      f.vault.metadata = { bytes: bytes!, durationMs: durationMs! };
      await assert.rejects(repo.finish(intent.id));
      assert.equal((await repo.list(intent.momentId))[0]?.status, 'pending');
      assert.equal(existsSync(f.vault.path(intent.id, 'staging')), true);
    }
    f.vault.metadata = { bytes: 4194304, durationMs: 240000 };
    await repo.finish(intent.id);
    assert.equal((await repo.list(intent.momentId))[0]?.bytes, 4194304);
  } finally { f.close(); }
});

test('individual deletion persists failure, resumes on restart, and blocks stale callbacks', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent); f.vault.seed(intent); await repo.finish(intent.id);
    f.vault.seed(intent, 'playback');
    f.vault.failures.add('all:clip-1');
    await assert.rejects(repo.remove(intent.id));
    assert.deepEqual(await repo.list(intent.momentId), []);
    assert.equal(existsSync(f.vault.path(intent.id, 'final')), true);
    await assert.rejects(repo.finish(intent.id));
    f.reopen();
    const reopened = await createClipJournal(f.db, f.vault);
    assert.deepEqual(await reopened.recover(), { completed: 1, pending: 0 });
    assert.equal(existsSync(f.vault.path(intent.id, 'final')), false);
    assert.equal(existsSync(f.vault.path(intent.id, 'playback')), false);
    await assert.rejects(reopened.begin(intent)); await assert.rejects(reopened.finish(intent.id));
    await reopened.remove(intent.id);
    assert.deepEqual(await reopened.journal.list(), [moment()]);
  } finally { f.close(); }
});

test('whole moment deletion retains its owner until every clip cleanup succeeds across restart', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    for (let n = 0; n < 23; n++) {
      const owner = { ...intent, id: `c${String(n).padStart(2, '0')}` };
      await repo.begin(owner); f.vault.seed(owner);
      if (n % 3 === 0) await repo.finish(owner.id);
      if (n % 3 === 1) { f.vault.failures.add(`staging:${owner.id}`); await assert.rejects(repo.finish(owner.id)); }
    }
    f.vault.failures.add('all:c00');
    await assert.rejects(repo.journal.remove(intent.momentId));
    assert.deepEqual(await repo.journal.list(), []);
    assert.deepEqual(await repo.list(intent.momentId), []);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM moments').get()?.n, 1);
    assert.equal(existsSync(f.vault.path('c22', 'staging')), false);
    await assert.rejects(repo.journal.save(moment()));
    await assert.rejects(repo.begin({ ...intent, id: 'late' }));
    f.reopen();
    const reopened = await createClipJournal(f.db, f.vault);
    assert.deepEqual(await reopened.recover(), { completed: 1, pending: 0 });
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM moments').get()?.n, 0);
    await assert.rejects(reopened.journal.save(moment()));
    await assert.rejects(reopened.begin(intent));
    await reopened.journal.remove(intent.momentId);
  } finally { f.close(); }
});

test('recovery advances past failed pages and attempts failed entries only once per pass', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    for (let n = 0; n < 45; n++) {
      const owner = { ...intent, id: `c${String(n).padStart(2, '0')}` };
      await repo.begin(owner);
      if (n !== 0 && n !== 20) f.vault.seed(owner);
    }
    assert.deepEqual(await repo.recover(), { completed: 43, pending: 2 });
    assert.deepEqual(await repo.recover(), { completed: 0, pending: 2 });
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM clips WHERE status = 'saved'").get()?.n, 43);
  } finally { f.close(); }
});

test('single database owner serializes finish/delete/queries and releases queue after failure', async () => {
  const f = await fixture();
  try {
    const [repo, same] = await Promise.all([createClipJournal(f.db, f.vault), createClipJournal(f.db, f.vault)]);
    assert.equal(repo, same);
    await assert.rejects(createClipJournal(f.db, new FixtureVault(f.root)));
    await repo.begin(intent); f.vault.seed(intent);
    let release!: () => void; let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    f.vault.onSeal = async () => { started(); await new Promise<void>(resolve => { release = resolve; }); };
    const finish = repo.finish(intent.id); await entered;
    const remove = repo.journal.remove(intent.momentId);
    const save = repo.journal.save(moment());
    const rejection = assert.rejects(save);
    const listing = repo.journal.list();
    release();
    await finish; await remove; await rejection;
    assert.deepEqual(await listing, []);
    await assert.rejects(repo.finish('missing'));
    await repo.journal.save(moment('new owner'));
    assert.deepEqual(await repo.journal.list(), [moment('new owner')]);
  } finally { f.close(); }
});

test('cleanup retry rejects changed final metadata and preserves original evidence and staging', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent); f.vault.seed(intent);
    f.vault.failures.add('staging:clip-1');
    await assert.rejects(repo.finish(intent.id));
    f.vault.failures.clear(); f.vault.metadata = { bytes: 17, durationMs: 1000 };
    await assert.rejects(repo.finish(intent.id));
    const [clip] = await repo.list(intent.momentId);
    assert.deepEqual([clip?.status, clip?.bytes, clip?.durationMs], ['cleanup-pending', 16, 1000]);
    assert.equal(existsSync(f.vault.path(intent.id, 'staging')), true);
    f.vault.metadata = undefined;
    await repo.finish(intent.id);
  } finally { f.close(); }
});

test('failed saved-state update after staging cleanup resumes with the final alone', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent); f.vault.seed(intent);
    f.inject(sql => { if (sql.includes("SET status = 'saved'")) throw new Error('private native database'); });
    await assert.rejects(repo.finish(intent.id));
    assert.equal(existsSync(f.vault.path(intent.id, 'staging')), false);
    assert.equal(existsSync(f.vault.path(intent.id, 'final')), true);
    f.reopen();
    const reopened = await createClipJournal(f.db, f.vault);
    assert.deepEqual(await reopened.recover(), { completed: 1, pending: 0 });
    assert.equal((await reopened.list(intent.momentId))[0]?.status, 'saved');
  } finally { f.close(); }
});

test('failed deletion commit retains its cleanup row after files are already removed', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent); f.vault.seed(intent); await repo.finish(intent.id);
    f.inject(sql => { if (sql === 'COMMIT') throw new Error('private sqlite location'); });
    await assert.rejects(repo.remove(intent.id));
    assert.equal(existsSync(f.vault.path(intent.id, 'final')), false);
    assert.equal(f.sqlite.prepare('SELECT status FROM clips').get()?.status, 'deleting');
    f.reopen();
    const reopened = await createClipJournal(f.db, f.vault);
    assert.deepEqual(await reopened.recover(), { completed: 1, pending: 0 });
    await assert.rejects(reopened.begin(intent));
  } finally { f.close(); }
});

test('queued operations retain caller snapshots of moment, clip owner/time and list cursor', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent); f.vault.seed(intent);
    let release!: () => void; let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    f.vault.onSeal = async () => { started(); await new Promise<void>(resolve => { release = resolve; }); };
    const finish = repo.finish(intent.id); await entered;
    const draft = moment('new-owner');
    const owner = { ...intent, id: 'clip-2', momentId: 'new-owner' };
    const cursor = { id: 'clip-3', createdAt: intent.createdAt };
    const save = repo.journal.save(draft);
    const begin = repo.begin(owner);
    const listing = repo.list('new-owner', cursor);
    draft.id = 'changed'; draft.supportText = 'Changed';
    owner.momentId = 'changed'; owner.createdAt = '2026-09-22T10:00:00.000Z';
    cursor.id = 'clip-1';
    release(); await finish; await save; await begin;
    assert.deepEqual((await listing).map(c => [c.id, c.momentId, c.createdAt]), [['clip-2', 'new-owner', '2026-09-21T10:00:00.000Z']]);
    assert.deepEqual((await repo.journal.list()).find(m => m.id === 'new-owner'), moment('new-owner'));
  } finally { f.close(); }
});

test('foreign keys restrict legacy deletion and unsupported enforcement refuses initialization', async () => {
  const f = await fixture();
  try {
    f.sqlite.exec('BEGIN');
    await assert.rejects(createClipJournal(f.db, f.vault));
    f.sqlite.exec('ROLLBACK');
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent);
    await assert.rejects(f.legacy.remove(intent.momentId));
    assert.equal((await repo.list(intent.momentId)).length, 1);
    assert.deepEqual(await repo.journal.list(), [moment()]);
    assert.throws(() => f.sqlite.prepare("UPDATE clips SET bytes = 4194305, durationMs = 1, status = 'saved'").run());
    f.inject(() => { throw new Error('private database /path'); });
    await assert.rejects(repo.journal.list(), e => e instanceof Error && !e.message.includes('private') && !e.cause);
    f.inject();
    assert.deepEqual(await repo.journal.list(), [moment()]);
  } finally { f.close(); }
});

test('failed rollback closes the owner to further operations until connection reopen', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent); f.vault.seed(intent);
    f.inject(sql => { if (sql === 'COMMIT' || sql === 'ROLLBACK') throw new Error('private disk failure'); });
    await assert.rejects(repo.finish(intent.id));
    f.inject();
    await assert.rejects(repo.journal.save(moment('unsafe-late-write')));
    await assert.rejects(repo.list(intent.momentId));
    f.reopen();
    const reopened = await createClipJournal(f.db, f.vault);
    assert.deepEqual(await reopened.recover(), { completed: 1, pending: 0 });
    assert.deepEqual(await reopened.journal.list(), [moment()]);
  } finally { f.close(); }
});

test('migration rollback failure refuses reuse of the uncertain connection', async () => {
  const f = await fixture();
  try {
    f.inject(sql => { if (sql === 'COMMIT' || sql === 'ROLLBACK') throw new Error('private disk failure'); });
    await assert.rejects(createClipJournal(f.db, f.vault));
    f.inject();
    await assert.rejects(createClipJournal(f.db, f.vault));
    f.reopen();
    assert.equal(f.sqlite.prepare('PRAGMA user_version').get()?.user_version, 1);
    const reopened = await createClipJournal(f.db, f.vault);
    assert.deepEqual(await reopened.journal.list(), [moment()]);
  } finally { f.close(); }
});

test('recovery pages moment deletions, including unrestricted owner IDs, past a failed first owner', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    for (let n = 0; n < 22; n++) {
      const id = n === 0 ? '' : `owner-${String(n).padStart(2, '0')}`;
      const owner = { ...intent, id: `c${String(n).padStart(2, '0')}`, momentId: id };
      await repo.journal.save(moment(id)); await repo.begin(owner); f.vault.seed(owner);
      f.vault.failures.add(`all:${owner.id}`);
      await assert.rejects(repo.journal.remove(id));
    }
    f.reopen(); f.vault.failures.add('all:c00');
    const reopened = await createClipJournal(f.db, f.vault);
    assert.deepEqual(await reopened.recover(), { completed: 21, pending: 1 });
    assert.equal(existsSync(f.vault.path('c21', 'staging')), false);
    assert.equal(existsSync(f.vault.path('c00', 'staging')), true);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM moment_deletions').get()?.n, 1);
    f.vault.failures.clear();
    assert.deepEqual(await reopened.recover(), { completed: 1, pending: 0 });
    await assert.rejects(reopened.journal.save(moment('')));
    assert.deepEqual(await reopened.journal.list(), [moment()]);
  } finally { f.close(); }
});

test('recovery attempts each failing seal once and deletes unknown IDs durably', async () => {
  const f = await fixture();
  try {
    const repo = await createClipJournal(f.db, f.vault);
    await repo.begin(intent);
    let attempts = 0;
    f.vault.onSeal = async () => { attempts++; };
    assert.deepEqual(await repo.recover(), { completed: 0, pending: 1 });
    assert.equal(attempts, 1);
    assert.deepEqual(await repo.recover(), { completed: 0, pending: 1 });
    assert.equal(attempts, 2);
    await repo.remove('future-clip'); await repo.journal.remove('future-owner');
    f.reopen();
    const reopened = await createClipJournal(f.db, f.vault);
    await assert.rejects(reopened.begin({ ...intent, id: 'future-clip' }));
    await assert.rejects(reopened.journal.save(moment('future-owner')));
  } finally { f.close(); }
});
