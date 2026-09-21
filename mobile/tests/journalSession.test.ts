import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { test } from 'node:test';
import { fixture, moment } from './helpers/clipFixture.ts';
import { createJournalSession, runtimeSession } from '../src/storage/journalSession.ts';
import { createNativeClipVault, type NativeClipBridge } from '../src/storage/nativeClipVault.ts';
import { createEncryptedOpener } from '../src/storage/encryptedJournal.ts';
import { createClipRecoveryExercise } from '../src/development/clipRecoveryExercise.ts';

const uuid = '12345678-1234-4234-8234-123456789abc';
const time = '2026-09-21T10:00:00.000Z';
const options = { debug: true, id: () => uuid, now: () => time };
async function rig() {
  const f = await fixture();
  const allows: boolean[] = [];
  const bridge: NativeClipBridge = {
    async initializeClips(allow) { allows.push(allow); },
    sealClip: (id, momentId, createdAt) => f.vault.seal({ id, momentId, createdAt }),
    async verifyClip(id, momentId, createdAt) {
      assert.ok(existsSync(f.vault.path(id, 'final')), 'Check must not seal missing finals');
      return f.vault.seal({ id, momentId, createdAt });
    },
    removeClipStaging: (id, momentId, createdAt) => f.vault.removeStaging({ id, momentId, createdAt }),
    removeClipFiles: (id, momentId, createdAt) => f.vault.removeAll({ id, momentId, createdAt }),
    async prepareClipFixture(id, momentId, createdAt) { f.vault.seed({ id, momentId, createdAt }); },
    async inspectClipFiles(id) { return { staging: existsSync(f.vault.path(id, 'staging')), final: existsSync(f.vault.path(id, 'final')), pending: false, verification: false }; },
  };
  return { f, bridge, allows, open: () => createJournalSession(f.db, createNativeClipVault(bridge), options) };
}

test('schema1 moment survives migration; interrupted fixture recovers on reopen and stays deleted after another reopen', async () => {
  const r = await rig();
  try {
    let s = await r.open();
    assert.deepEqual(await s.journal.list(), [moment()]);
    assert.deepEqual(r.allows, [true]);
    assert.deepEqual(await s.exercise!.prepare(), { status: 'restart', saved: 1, pending: 1 });
    const synthetic = (await s.journal.list()).find(m => m.id === uuid)!;
    assert.deepEqual(synthetic, { id: uuid, createdAt: time, emotionId: 'learning-clip-recovery', emotionLabel: 'Clip recovery exercise', supportText: 'Generated clips for the recovery lesson.' });
    assert.deepEqual(await s.exercise!.check(), { status: 'restart', saved: 1, pending: 1 });
    r.f.reopen(); s = await r.open();
    assert.deepEqual(r.allows, [true, false]);
    assert.deepEqual(await s.exercise!.check(), { status: 'recovered', saved: 2, pending: 0 });
    assert.deepEqual(await s.exercise!.remove(), { status: 'deleted', saved: 0, pending: 0 });
    r.f.reopen(); s = await r.open();
    assert.deepEqual(await s.exercise!.check(), { status: 'deleted', saved: 0, pending: 0 });
    assert.deepEqual(await s.journal.list(), [moment()]);
  } finally { r.f.close(); }
});

test('older APK keeps schema1 usable and refuses schema2 or newer without downgrading', async () => {
  const r = await rig();
  try {
    const old = await createJournalSession(r.f.db, null, options);
    assert.equal(old.exercise, null); assert.equal(old.clips, null);
    assert.deepEqual(await old.journal.list(), [moment()]);
    assert.equal(r.f.sqlite.prepare('PRAGMA user_version').get()!.user_version, 1);
    await r.open();
    await assert.rejects(createJournalSession(r.f.db, null, options));
    r.f.sqlite.exec('PRAGMA user_version = 3');
    await assert.rejects(r.open());
    assert.equal(r.f.sqlite.prepare('PRAGMA user_version').get()!.user_version, 3);
  } finally { r.f.close(); }
});

test('tombstones alone prohibit creation of replacement media keys', async () => {
  const r = await rig();
  try {
    const s = await r.open(); await s.journal.remove('missing'); r.f.reopen();
    r.bridge.initializeClips = async allow => { assert.equal(allow, false); throw new Error('secret key path'); };
    await assert.rejects(r.open(), e => e instanceof Error && !e.message.includes('secret') && !e.cause);
    assert.deepEqual(r.f.sqlite.prepare('SELECT * FROM moment_tombstones').all().map(x => x.id), ['missing']);
  } finally { r.f.close(); }
});

test('ordinary pending recovery remains visible, blocks new fixtures, and permits journal support', async () => {
  const r = await rig();
  try {
    let s = await r.open(); await s.clips!.begin({ id: 'unready', momentId: 'moment-1', createdAt: time });
    r.f.reopen(); s = await r.open();
    assert.equal((await s.recovery()).pending, 1);
    await assert.rejects(s.exercise!.prepare());
    await s.journal.save(moment('another'));
    assert.equal((await s.journal.list()).length, 2);
  } finally { r.f.close(); }
});

test('marker is saved before moment, supports retry after save failure, and missing owner is not deletion proof', async () => {
  const r = await rig();
  try {
    const s = await r.open();
    r.f.inject(sql => { if (sql.startsWith('INSERT INTO moments')) throw Error('save failed'); });
    await assert.rejects(s.exercise!.prepare()); r.f.inject();
    assert.equal(r.f.sqlite.prepare('SELECT momentId FROM development_clip_exercise').get()!.momentId, uuid);
    assert.deepEqual(await s.exercise!.check(), { status: 'incomplete', saved: 0, pending: 0 });
    await assert.rejects(s.exercise!.remove());
    assert.equal((await s.exercise!.prepare()).status, 'restart');
  } finally { r.f.close(); }
});

test('marker write failure does not create an unmarked moment', async () => {
  const r = await rig();
  try {
    const s = await r.open();
    r.f.inject(sql => { if (sql.includes('INSERT INTO development_clip_exercise')) throw Error('marker failed'); });
    await assert.rejects(s.exercise!.prepare()); r.f.inject();
    assert.deepEqual(await s.journal.list(), [moment()]);
    assert.equal((await s.exercise!.prepare()).status, 'restart');
  } finally { r.f.close(); }
});

test('destructive lesson operations reject modified synthetic fields and invalid marker IDs', async () => {
  for (const field of ['emotionId', 'emotionLabel', 'supportText', 'createdAt']) {
    const r = await rig();
    try {
      const s = await r.open(); await s.exercise!.prepare();
      r.f.sqlite.prepare(`UPDATE moments SET ${field} = ? WHERE id = ?`).run('private replacement', uuid);
      await assert.rejects(s.exercise!.remove()); await assert.rejects(s.exercise!.prepare());
      assert.equal((await s.journal.list()).length, 2);
      r.f.sqlite.prepare('UPDATE development_clip_exercise SET momentId = ?').run('moment-1');
      await assert.rejects(s.exercise!.remove());
      assert.ok(existsSync(r.f.vault.path(`clip-${uuid}-a`, 'final')));
    } finally { r.f.close(); }
  }
});

test('journal deletion waits for the entire learning composition, preventing late files', async () => {
  const r = await rig();
  try {
    const s = await r.open(); let release!: () => void; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    r.f.vault.onSeal = async () => { entered(); await gate; };
    const preparing = s.exercise!.prepare(); await started;
    const deleting = s.journal.remove(uuid); release();
    await Promise.all([preparing, deleting]);
    assert.deepEqual(await s.exercise!.check(), { status: 'deleted', saved: 0, pending: 0 });
  } finally { r.f.close(); }
});

test('global runtime slot shares an initialization across factory reloads and retries failures', async () => {
  const host = {}; let calls = 0;
  const first = runtimeSession(host, async () => { calls++; return { marker: true }; });
  const second = runtimeSession(host, async () => { throw Error('must not open twice'); });
  assert.equal(await first(), await second()); assert.equal(calls, 1);
  const retryHost = {}; let attempts = 0;
  const retry = runtimeSession(retryHost, async () => { if (++attempts === 1) throw Error('fail'); return 42; });
  await assert.rejects(retry()); assert.equal(await retry(), 42);
});

test('generic encrypted initialization runs after keying, closes on failure, and preserves the saved key on retry', async () => {
  const r = await rig(); let key: string | null = null; let closed = 0; let keyed = false; let stores = 0;
  const db = { ...r.f.db, async closeAsync() { closed++; }, async execAsync(sql: string) { if (sql.startsWith('PRAGMA key')) { assert.ok(key); keyed = true; } else await r.f.db.execAsync(sql); }, async getAllAsync<T>(sql: string, ...params: string[]) { if (sql === 'PRAGMA cipher_version') return [{ cipher_version: 'test' }] as T[]; assert.ok(keyed); return r.f.db.getAllAsync<T>(sql, ...params); } };
  let attempts = 0;
  const open = createEncryptedOpener({ async getKey() { return key; }, async hasExistingData() { return false; }, async storeKey(value) { key = value; stores++; }, async randomBytes() { return new Uint8Array(32); }, async openDatabase() { return db; } }, async database => {
    assert.ok(keyed); if (++attempts === 1) throw Error('private data');
    return createJournalSession(database, createNativeClipVault(r.bridge), options);
  });
  try { await assert.rejects(open(), /Encrypted journal unavailable/); assert.equal(closed, 1); await open(); assert.equal(stores, 1); } finally { r.f.close(); }
});

test('native adapter strips extra data, bounds results, sanitizes errors and detects older bridge', async () => {
  const r = await rig();
  try {
    assert.equal(createNativeClipVault({}), null);
    const vault = createNativeClipVault(r.bridge)!;
    for (const metadata of [{ bytes: 0, durationMs: 1 }, { bytes: 1, durationMs: 240001 }, { bytes: 4194305, durationMs: 1 }, { bytes: 1.5, durationMs: 1 }]) {
      r.bridge.sealClip = async () => metadata;
      await assert.rejects(vault.seal({ id: 'a', momentId: '', createdAt: time }));
    }
    r.bridge.sealClip = async () => ({ bytes: 16044, durationMs: 1000, secret: 'private' });
    assert.deepEqual(await vault.seal({ id: 'a', momentId: '', createdAt: time }), { bytes: 16044, durationMs: 1000 });
    r.bridge.sealClip = async () => { throw Error('private'); };
    await assert.rejects(vault.seal({ id: 'a', momentId: '', createdAt: time }), e => e instanceof Error && !e.message.includes('private') && !e.cause);
  } finally { r.f.close(); }
});

test('app lesson controller ignores repeated taps and clears stale results on failure', async () => {
  let release!: () => void; let calls = 0;
  const controller = createClipRecoveryExercise(async () => ({ exercise: { async prepare() { calls++; await new Promise<void>(resolve => { release = resolve; }); return { status: 'restart' as const, saved: 1, pending: 1 }; }, async check() { throw Error('private'); }, async remove() { throw Error('private'); } } }));
  const first = controller.prepare(); await Promise.resolve(); await Promise.resolve();
  await controller.prepare(); assert.equal(calls, 1); release(); await first;
  assert.equal(controller.getSnapshot().result!.status, 'restart');
  await controller.check(); assert.equal(controller.getSnapshot().status, 'failed'); assert.equal(controller.getSnapshot().result, null);
});

test('controller refreshes pending count after its operation instead of displaying stale recovery work', async () => {
  let pending = 1;
  const controller = createClipRecoveryExercise(async () => ({
    recovery: async () => ({ pending }),
    exercise: { prepare: async () => { throw Error(); }, check: async () => { throw Error(); }, remove: async () => { pending = 0; return { status: 'deleted', saved: 0, pending: 0 }; } },
  }));
  await controller.remove();
  assert.equal(controller.getSnapshot().recoveryPending, 0);
});

test('deleted exercise allocates fresh UUIDs on explicit Prepare and never revives old owners', async () => {
  const r = await rig();
  try {
    const nextId = '87654321-1234-4234-9234-123456789abc'; let calls = 0;
    const s = await createJournalSession(r.f.db, createNativeClipVault(r.bridge), { ...options, id: () => ++calls === 1 ? uuid : nextId });
    await s.exercise!.prepare(); await s.exercise!.remove(); await s.exercise!.prepare();
    assert.equal(calls, 2);
    assert.deepEqual((await s.journal.list()).map(m => m.id).sort(), [nextId, 'moment-1'].sort());
    assert.equal(r.f.sqlite.prepare('SELECT id FROM moment_tombstones WHERE id = ?').get(uuid)!.id, uuid);
    assert.ok(!existsSync(r.f.vault.path(`clip-${uuid}-a`, 'final')));
  } finally { r.f.close(); }
});

test('Check authenticates existing finals only and cannot recreate a missing saved file', async () => {
  const r = await rig();
  try {
    let s = await r.open(); await s.exercise!.prepare(); r.f.reopen(); s = await r.open();
    const missing = r.f.vault.path(`clip-${uuid}-a`, 'final'); rmSync(missing);
    await assert.rejects(s.exercise!.check()); assert.equal(existsSync(missing), false);
  } finally { r.f.close(); }
});

test('fixture error leaves a durable intent and same-process Prepare retries without duplicating rows', async () => {
  const r = await rig();
  try {
    const s = await r.open(); const prepare = r.bridge.prepareClipFixture; let fail = true;
    r.bridge.prepareClipFixture = async (...args) => { if (fail) throw Error('fixture failed'); await prepare(...args); };
    await assert.rejects(s.exercise!.prepare());
    assert.equal(r.f.sqlite.prepare('SELECT count(*) AS count FROM clips').get()!.count, 1);
    fail = false; assert.equal((await s.exercise!.prepare()).status, 'restart');
    assert.equal(r.f.sqlite.prepare('SELECT count(*) AS count FROM clips').get()!.count, 2);
  } finally { r.f.close(); }
});

test('non-debug sessions do not create marker tables or expose fixture operations', async () => {
  const r = await rig();
  try {
    const s = await createJournalSession(r.f.db, createNativeClipVault(r.bridge), { ...options, debug: false });
    assert.equal(s.exercise, null);
    assert.equal(r.f.sqlite.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'development_clip_exercise'").get()!.count, 0);
  } finally { r.f.close(); }
});

test('failed preparation reports newly pending work rather than its pre-operation count', async () => {
  const r = await rig();
  try {
    const s = await r.open();
    r.bridge.prepareClipFixture = async () => { throw Error('native failure'); };
    const controller = createClipRecoveryExercise(async () => s);
    await controller.prepare();
    assert.equal(controller.getSnapshot().status, 'failed');
    assert.equal(controller.getSnapshot().recoveryPending, 1);
  } finally { r.f.close(); }
});

test('fresh schema0 initializes moments before migration and keeps subsequent snapshots', async () => {
  const r = await rig();
  try {
    r.f.sqlite.exec('DROP TABLE moments; PRAGMA user_version = 0');
    const s = await r.open(); await s.journal.save(moment());
    assert.equal(r.f.sqlite.prepare('PRAGMA user_version').get()!.user_version, 2);
    assert.deepEqual(await s.journal.list(), [moment()]);
  } finally { r.f.close(); }
});

test('each kind of prior clip or deletion evidence independently disables media key creation', async () => {
  for (const statement of [
    "INSERT INTO clips(id, momentId, createdAt, status) VALUES ('orphan', 'moment-1', '2026-09-21T10:00:00.000Z', 'pending')",
    "INSERT INTO moment_deletions(id) VALUES ('moment-1')",
    "INSERT INTO clip_tombstones(id) VALUES ('old-clip')",
    "INSERT INTO moment_tombstones(id) VALUES ('old-moment')",
  ]) {
    const r = await rig();
    try {
      await r.open(); r.f.sqlite.exec(statement); r.f.reopen();
      r.bridge.initializeClips = async allow => { assert.equal(allow, false); throw Error('media key missing'); };
      await assert.rejects(r.open());
      assert.equal(r.f.sqlite.prepare('PRAGMA user_version').get()!.user_version, 2);
    } finally { r.f.close(); }
  }
});

test('inspection rejects malformed native flags and drops unexpected diagnostic fields', async () => {
  const r = await rig();
  try {
    const vault = createNativeClipVault(r.bridge)!;
    r.bridge.inspectClipFiles = async () => ({ staging: false, final: true, pending: false, verification: false, private: 'path' });
    assert.deepEqual(await vault.inspect('a'), { staging: false, final: true, pending: false, verification: false });
    r.bridge.inspectClipFiles = async () => ({ staging: false, final: true, pending: false, verification: 'false' } as unknown as Awaited<ReturnType<NativeClipBridge['inspectClipFiles']>>);
    await assert.rejects(vault.inspect('a'));
  } finally { r.f.close(); }
});
