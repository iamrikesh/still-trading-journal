import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createSqlJournal, type JournalDatabase } from '../src/storage/sqlJournal.ts';
import type { Moment } from '../src/storage/types.ts';
import { createMemoryJournal } from '../src/storage/memoryJournal.ts';
import { sqliteDirectoryUri } from '../src/storage/sqliteDirectoryUri.ts';
import { createEncryptedJournalOpener, type EncryptedDatabase, type EncryptionDependencies } from '../src/storage/encryptedJournal.ts';

function driver(db: DatabaseSync): JournalDatabase {
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...params) { return db.prepare(sql).run(...params); },
    async getAllAsync<T>(sql: string, ...params: string[]) {
      return db.prepare(sql).all(...params).map((row) => ({ ...row })) as T[];
    },
  };
}

function moment(id = 'one', createdAt = '2026-09-20T10:00:00.000Z'): Moment {
  return { id, emotionId: 'fomo', emotionLabel: 'FOMO', createdAt, supportText: 'Pause. A missed trade is not a loss.' };
}

test('SQLite native directories become local File URIs without changing their path', () => {
  assert.equal(sqliteDirectoryUri('/data/user/0/com.example.still/files/SQLite'), 'file:///data/user/0/com.example.still/files/SQLite');
  assert.equal(sqliteDirectoryUri('/data/space #100%/SQLite'), 'file:///data/space%20%23100%25/SQLite');
  assert.equal(sqliteDirectoryUri('file:///var/mobile/Application/Example%20App/SQLite'), 'file:///var/mobile/Application/Example%20App/SQLite');
});

test('saved moment survives closing and reopening a real SQLite file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'still-storage-'));
  const path = join(directory, 'journal.db');
  let db = new DatabaseSync(path);
  try {
    await (await createSqlJournal(driver(db))).save(moment());
    db.close();
    db = new DatabaseSync(path);
    const journal = await createSqlJournal(driver(db));
    assert.deepEqual(await journal.list(), [moment()]);
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('unusual text remains data in save and deletion', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = await createSqlJournal(driver(db));
    const unusual = { ...moment("quote'; DROP TABLE moments; --"), emotionLabel: "O'Brien 🧘", supportText: 'First line\n"Second"; नमस्ते' };
    await journal.save(unusual);
    await journal.save(moment('safe'));
    assert.deepEqual((await journal.list()).find((row) => row.id === unusual.id), unusual);
    await journal.remove(unusual.id);
    assert.deepEqual(await journal.list(), [moment('safe')]);
  } finally { db.close(); }
});

test('retrying a saved ID preserves the original timestamp and support', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = await createSqlJournal(driver(db));
    await journal.save(moment());
    await journal.save({ ...moment('one', '2026-09-21T10:00:00.000Z'), supportText: 'Changed' });
    assert.deepEqual(await journal.list(), [moment()]);
  } finally { db.close(); }
});

test('history returns the latest 50 with deterministic ties without deleting older records', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const journal = await createSqlJournal(driver(db));
    for (let index = 0; index < 55; index++) await journal.save(moment(`m${String(index).padStart(2, '0')}`));
    await journal.save(moment('newest', '2026-09-21T10:00:00.000Z'));
    const rows = await journal.list();
    assert.equal(rows.length, 50);
    assert.equal(rows[0]?.id, 'newest');
    assert.equal(rows[1]?.id, 'm54');
    assert.equal(rows[49]?.id, 'm06');
    await journal.remove('newest');
    assert.equal((await journal.list())[49]?.id, 'm05');
  } finally { db.close(); }
});

test('newer schema fails without replacing existing history', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE future_moments (text TEXT); INSERT INTO future_moments VALUES ('keep'); PRAGMA user_version = 2;");
    await assert.rejects(createSqlJournal(driver(db)), /newer|unsupported/i);
    assert.equal(db.prepare('SELECT text FROM future_moments').get()?.text, 'keep');
  } finally { db.close(); }
});

test('demo storage is bounded, isolated between instances, and protects saved snapshots', async () => {
  const journal = createMemoryJournal();
  const first = moment('original', '2026-09-21T10:00:00.000Z');
  await journal.save(first);
  first.supportText = 'Outside mutation';
  await journal.save({ ...first, supportText: 'Retry mutation' });
  assert.deepEqual(await journal.list(), [moment('original', '2026-09-21T10:00:00.000Z')]);
  const copy = await journal.list();
  assert.ok(copy[0]);
  copy[0].supportText = 'Returned mutation';
  assert.equal((await journal.list())[0]?.supportText, 'Pause. A missed trade is not a loss.');
  for (let index = 0; index < 55; index++) await journal.save(moment(`m${String(index).padStart(2, '0')}`));
  assert.equal((await journal.list()).length, 50);
  assert.equal((await journal.list())[1]?.id, 'm54');
  await journal.remove('original');
  assert.equal((await journal.list()).length, 49);
  assert.deepEqual(await createMemoryJournal().list(), []);
});

// node:sqlite cannot encrypt. This test-only boundary simulates the native cipher
// handshake and key vault; all schema and journal operations still use real SQLite.
function encryptionHarness(options: {
  key?: string | null;
  existing?: boolean;
  cipher?: boolean;
  keyWriteFails?: boolean;
  schemaFails?: boolean;
} = {}) {
  const raw = new DatabaseSync(':memory:');
  const sql = driver(raw);
  const state = { key: options.key ?? null as string | null, opens: 0, closed: 0, keyed: false, writes: 0 };
  const db: EncryptedDatabase = {
    ...sql,
    async execAsync(statement) {
      if (statement.startsWith('PRAGMA key')) {
        assert.match(statement, /^PRAGMA key = "x'[0-9a-f]{64}'"$/);
        assert.ok(state.key, 'Key must be secured before database writes');
        state.keyed = true;
        return;
      }
      assert.ok(state.keyed, 'No schema writes before keying');
      return sql.execAsync(statement);
    },
    async getAllAsync<T>(statement: string, ...params: string[]) {
      if (statement === 'PRAGMA cipher_version') return (options.cipher === false ? [] : [{ cipher_version: '4.0.0' }]) as T[];
      assert.ok(state.keyed, 'No database pages read before keying');
      if (options.schemaFails) throw new Error('Native failure containing sensitive diagnostics');
      return sql.getAllAsync<T>(statement, ...params);
    },
    async closeAsync() { state.closed++; },
  };
  const dependencies: EncryptionDependencies = {
    async hasExistingData() { return options.existing ?? false; },
    async getKey() { return state.key; },
    async storeKey(key) {
      state.writes++;
      if (options.keyWriteFails) throw new Error('Key vault unavailable');
      state.key = key;
    },
    async randomBytes() { return Uint8Array.from({ length: 32 }, (_, index) => index); },
    async openDatabase() { state.opens++; return db; },
  };
  return { raw, state, open: createEncryptedJournalOpener(dependencies) };
}

test('native initialization has one owner and secures a 32-byte key before migration', async () => {
  const harness = encryptionHarness();
  try {
    const [first, second] = await Promise.all([harness.open(), harness.open()]);
    assert.equal(first, second);
    assert.equal(harness.state.opens, 1);
    assert.equal(harness.state.key, '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
    await first.save(moment());
    assert.deepEqual(await second.list(), [moment()]);
  } finally { harness.raw.close(); }
});

test('missing key with existing data fails without opening or replacing the database', async () => {
  const harness = encryptionHarness({ existing: true });
  try {
    await assert.rejects(harness.open());
    assert.equal(harness.state.opens, 0);
    assert.equal(harness.state.writes, 0);
  } finally { harness.raw.close(); }
});

test('a malformed saved key fails without changing the key or opening a database', async () => {
  const harness = encryptionHarness({ key: "'; invalid" });
  try {
    await assert.rejects(harness.open());
    assert.equal(harness.state.opens, 0);
    assert.equal(harness.state.writes, 0);
  } finally { harness.raw.close(); }
});

for (const [name, options] of [
  ['SQLCipher unavailable', { cipher: false }],
  ['secure key write fails', { keyWriteFails: true }],
  ['database unreadable', { key: 'ab'.repeat(32), schemaFails: true }],
] as const) {
  test(`${name} fails closed and allows another initialization attempt`, async () => {
    const harness = encryptionHarness(options);
    try {
      await assert.rejects(harness.open(), (error: Error) => !error.message.includes('sensitive diagnostics'));
      assert.equal(harness.state.closed, 1);
      assert.equal(harness.raw.prepare('SELECT count(*) AS count FROM sqlite_master WHERE name = ?').get('moments')?.count, 0);
      await assert.rejects(harness.open());
      assert.equal(harness.state.closed, 2);
    } finally { harness.raw.close(); }
  });
}
