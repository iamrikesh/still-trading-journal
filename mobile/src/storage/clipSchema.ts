import type { JournalDatabase } from './sqlJournal.ts';

// A failed rollback leaves transaction state unknown. Only closing and handing
// over a new connection can recover; another queued write must never commit it.
const unusable = new WeakSet<JournalDatabase>();
export function requireUsableClipDatabase(db: JournalDatabase): void {
  if (unusable.has(db)) throw new Error('Clip database must be reopened.');
}

export async function clipTransaction(db: JournalDatabase, work: () => Promise<void>): Promise<void> {
  requireUsableClipDatabase(db);
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await work();
    await db.execAsync('COMMIT');
  } catch (error) {
    try { await db.execAsync('ROLLBACK'); } catch { unusable.add(db); }
    throw error;
  }
}

/** Opt-in only: the deployed schema-1 opener deliberately remains unchanged. */
export async function migrateClipSchema(db: JournalDatabase): Promise<void> {
  requireUsableClipDatabase(db);
  await db.execAsync('PRAGMA foreign_keys = ON');
  const [foreignKeys] = await db.getAllAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  if (foreignKeys?.foreign_keys !== 1) throw new Error('Foreign key enforcement required.');
  const [version] = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
  if (version?.user_version === 2) return;
  if (version?.user_version !== 1) throw new Error('Unsupported clip schema.');
  await clipTransaction(db, async () => {
    await db.execAsync(`
      CREATE TABLE clips (
        id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-z0-9-]*'),
        momentId TEXT NOT NULL REFERENCES moments(id) ON DELETE RESTRICT,
        createdAt TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'cleanup-pending', 'saved', 'deleting')),
        bytes INTEGER CHECK(bytes IS NULL OR (typeof(bytes) = 'integer' AND bytes BETWEEN 1 AND 4194304)),
        durationMs INTEGER CHECK(durationMs IS NULL OR (typeof(durationMs) = 'integer' AND durationMs BETWEEN 1 AND 240000)),
        CHECK((bytes IS NULL) = (durationMs IS NULL)),
        CHECK(status <> 'pending' OR bytes IS NULL),
        CHECK(status NOT IN ('cleanup-pending', 'saved') OR bytes IS NOT NULL)
      );
      CREATE INDEX clips_recent ON clips(momentId, createdAt DESC, id DESC);
      CREATE INDEX clips_unfinished ON clips(id) WHERE status <> 'saved';
      CREATE TABLE moment_deletions (
        id TEXT PRIMARY KEY NOT NULL REFERENCES moments(id) ON DELETE RESTRICT
      );
      CREATE TABLE clip_tombstones (id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE moment_tombstones (id TEXT PRIMARY KEY NOT NULL);
      PRAGMA user_version = 2;
    `);
  });
}
