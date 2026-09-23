import type { JournalRepository, Moment } from './types.ts';

export interface JournalDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: (string | null)[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: string[]): Promise<T[]>;
}

export async function createSqlJournal(db: JournalDatabase): Promise<JournalRepository> {
  const [version] = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
  if (!version || !Number.isInteger(version.user_version) || version.user_version < 0 || version.user_version > 1) {
    throw new Error('Unsupported or newer journal schema.');
  }
  if (version.user_version === 0) {
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      await db.execAsync(`
        CREATE TABLE moments (
          id TEXT PRIMARY KEY NOT NULL,
          emotionId TEXT NOT NULL,
          emotionLabel TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          supportText TEXT NOT NULL
        );
        CREATE INDEX moments_recent ON moments (createdAt DESC, id DESC);
        PRAGMA user_version = 1;
      `);
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  }
  return {
    async save(moment) {
      await db.runAsync(
        `INSERT INTO moments (id, emotionId, emotionLabel, createdAt, supportText)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
        moment.id, moment.emotionId, moment.emotionLabel, moment.createdAt, moment.supportText,
      );
    },
    async list() {
      return db.getAllAsync<Moment>(
        'SELECT id, emotionId, emotionLabel, createdAt, supportText FROM moments ORDER BY createdAt DESC, id DESC LIMIT 50',
      );
    },
    async remove(id) {
      await db.runAsync('DELETE FROM moments WHERE id = ?', id);
    },
  };
}
