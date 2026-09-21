import type { JournalDatabase } from './sqlJournal.ts';
import type { Moment } from './types.ts';
import type { Clip, ClipCursor, ClipIntent, ClipJournal, ClipVault } from './clipTypes.ts';
import { clipTransaction, migrateClipSchema, requireUsableClipDatabase } from './clipSchema.ts';

type ClipRow = Omit<Clip, 'status'> & { status: Clip['status'] | 'deleting' };
const owners = new WeakMap<JournalDatabase, { vault: ClipVault; ready: Promise<ClipJournal> }>();
const fields = 'id, momentId, createdAt, status, bytes, durationMs';
const failure = () => new Error('Clip journal operation failed.');

function validateId(id: string) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) throw failure();
}
function validateTimestamp(value: string) {
  const time = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(time) || new Date(time).toISOString() !== value) throw failure();
}
function ownedIntent(row: ClipIntent): ClipIntent {
  validateId(row.id);
  validateTimestamp(row.createdAt);
  return { id: row.id, momentId: row.momentId, createdAt: row.createdAt };
}

/** Requires an existing schema-1/2 connection and exclusive ownership of its vault
 * namespace. Retire any legacy journal object before this handoff; all subsequent
 * journal writes must use the returned journal. The future native opener must
 * enforce this precondition across connections and module reloads. */
export async function createClipJournal(db: JournalDatabase, vault: ClipVault): Promise<ClipJournal> {
  const owner = owners.get(db);
  if (owner) {
    if (owner.vault !== vault) throw failure();
    return owner.ready;
  }
  const ready = initialize(db, vault).catch(() => {
    owners.delete(db);
    throw failure();
  });
  owners.set(db, { vault, ready });
  return ready;
}

async function initialize(db: JournalDatabase, vault: ClipVault): Promise<ClipJournal> {
  await migrateClipSchema(db);
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(() => {
      requireUsableClipDatabase(db);
      return work();
    }).catch(() => { throw failure(); });
    tail = result.catch(() => undefined);
    return result;
  }
  async function has(sql: string, id: string) {
    return (await db.getAllAsync<{ id: string }>(sql, id)).length !== 0;
  }
  async function deletedMoment(id: string) {
    return (await db.getAllAsync<{ id: string }>(
      'SELECT id FROM moment_deletions WHERE id = ? UNION ALL SELECT id FROM moment_tombstones WHERE id = ?', id, id,
    )).length !== 0;
  }
  async function readClip(id: string) {
    validateId(id);
    return (await db.getAllAsync<ClipRow>(`SELECT ${fields} FROM clips WHERE id = ?`, id))[0];
  }
  async function finish(id: string) {
    const row = await readClip(id);
    if (!row || row.status === 'deleting' || await deletedMoment(row.momentId)) throw failure();
    if (row.status === 'saved') return;
    const intent = ownedIntent(row);
    const { bytes, durationMs } = await vault.seal(intent);
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > 4194304 ||
        !Number.isInteger(durationMs) || durationMs < 1 || durationMs > 240000) throw failure();
    if (row.status === 'cleanup-pending') {
      if (bytes !== row.bytes || durationMs !== row.durationMs) throw failure();
    } else {
      await clipTransaction(db, async () => {
        await db.runAsync("UPDATE clips SET bytes = ?, durationMs = ?, status = 'cleanup-pending' WHERE id = ?", String(bytes), String(durationMs), id);
      });
    }
    await vault.removeStaging(ownedIntent(row));
    await db.runAsync("UPDATE clips SET status = 'saved' WHERE id = ?", id);
  }
  async function deleteClip(id: string) {
    const row = await readClip(id);
    if (row) {
      await db.runAsync("UPDATE clips SET status = 'deleting' WHERE id = ?", id);
      await vault.removeAll(ownedIntent(row));
    }
    await clipTransaction(db, async () => {
      await db.runAsync('INSERT INTO clip_tombstones(id) VALUES (?) ON CONFLICT(id) DO NOTHING', id);
      await db.runAsync('DELETE FROM clips WHERE id = ?', id);
    });
  }
  async function deleteMoment(id: string) {
    // The intent survives failures and hides all of its clips immediately.
    if (await has('SELECT id FROM moments WHERE id = ?', id)) {
      await db.runAsync('INSERT INTO moment_deletions(id) VALUES (?) ON CONFLICT(id) DO NOTHING', id);
      let after = '';
      let failed = false;
      while (true) {
        const page = await db.getAllAsync<{ id: string }>('SELECT id FROM clips WHERE momentId = ? AND id > ? ORDER BY id LIMIT 20', id, after);
        if (!page.length) break;
        for (const row of page) {
          after = row.id;
          try { await deleteClip(row.id); } catch {
            requireUsableClipDatabase(db);
            failed = true;
          }
        }
      }
      if (failed) throw failure();
    }
    await clipTransaction(db, async () => {
      await db.runAsync('INSERT INTO moment_tombstones(id) VALUES (?) ON CONFLICT(id) DO NOTHING', id);
      await db.runAsync('DELETE FROM moment_deletions WHERE id = ?', id);
      await db.runAsync('DELETE FROM moments WHERE id = ?', id);
    });
  }
  return {
    journal: {
      save(moment) {
        const snapshot = { ...moment };
        return enqueue(async () => {
          if (await deletedMoment(snapshot.id)) throw failure();
          await db.runAsync(`INSERT INTO moments(id, emotionId, emotionLabel, createdAt, supportText)
            VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
          snapshot.id, snapshot.emotionId, snapshot.emotionLabel, snapshot.createdAt, snapshot.supportText);
        });
      },
      list: () => enqueue(() => db.getAllAsync<Moment>(`SELECT id, emotionId, emotionLabel, createdAt, supportText FROM moments
        WHERE NOT EXISTS (SELECT 1 FROM moment_deletions WHERE moment_deletions.id = moments.id)
        ORDER BY createdAt DESC, id DESC LIMIT 50`)),
      remove: id => enqueue(() => deleteMoment(id)),
    },
    begin(intent) {
      const snapshot = { ...intent };
      return enqueue(async () => {
        ownedIntent(snapshot);
        if (await deletedMoment(snapshot.momentId) || !await has('SELECT id FROM moments WHERE id = ?', snapshot.momentId) ||
            await has('SELECT id FROM clip_tombstones WHERE id = ?', snapshot.id)) throw failure();
        const row = await readClip(snapshot.id);
        if (row) {
          if (row.status === 'deleting' || row.momentId !== snapshot.momentId || row.createdAt !== snapshot.createdAt) throw failure();
          return;
        }
        await db.runAsync("INSERT INTO clips(id, momentId, createdAt, status) VALUES (?, ?, ?, 'pending')", snapshot.id, snapshot.momentId, snapshot.createdAt);
      });
    },
    finish: id => enqueue(() => finish(id)),
    list(momentId: string, before?: ClipCursor) {
      const cursor = before && { ...before };
      return enqueue(async () => {
        if (cursor) { validateId(cursor.id); validateTimestamp(cursor.createdAt); }
        return db.getAllAsync<Clip>(`SELECT ${fields} FROM clips WHERE momentId = ? AND status <> 'deleting'
          AND NOT EXISTS (SELECT 1 FROM moment_deletions WHERE moment_deletions.id = clips.momentId)
          ${cursor ? 'AND (createdAt < ? OR (createdAt = ? AND id < ?))' : ''}
          ORDER BY createdAt DESC, id DESC LIMIT 20`,
        momentId, ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : []));
      });
    },
    remove: id => enqueue(() => deleteClip(id)),
    recover: () => enqueue(async () => {
      const counts = { completed: 0, pending: 0 };
      async function pass(query: string, work: (id: string) => Promise<void>) {
        let after: string | undefined;
        while (true) {
          const page = await db.getAllAsync<{ id: string }>(query, after === undefined ? '1' : '0', after ?? '');
          if (!page.length) return;
          for (const row of page) {
            after = row.id;
            try { await work(row.id); counts.completed++; } catch {
              requireUsableClipDatabase(db);
              counts.pending++;
            }
          }
        }
      }
      await pass('SELECT id FROM moment_deletions WHERE (? = \'1\' OR id > ?) ORDER BY id LIMIT 20', deleteMoment);
      await pass(`SELECT id FROM clips WHERE status <> 'saved'
        AND NOT EXISTS (SELECT 1 FROM moment_deletions WHERE moment_deletions.id = clips.momentId)
        AND (? = '1' OR id > ?) ORDER BY id LIMIT 20`, async id => {
        const row = await readClip(id);
        if (row?.status === 'deleting') await deleteClip(id);
        else await finish(id);
      });
      return counts;
    }),
  };
}
