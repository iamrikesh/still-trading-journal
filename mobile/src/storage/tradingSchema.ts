import { clipTransaction } from './clipSchema.ts';
import type { JournalDatabase } from './sqlJournal.ts';

export async function migrateTradingSchema(db: JournalDatabase): Promise<void> {
  const [version] = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
  if (version?.user_version === 3 || version?.user_version === 4) return;
  if (version?.user_version !== 2) throw new Error('Unsupported trading schema.');
  await clipTransaction(db, async () => {
    await db.execAsync(`
      CREATE TABLE trading_sessions (
        id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 64),
        title TEXT NOT NULL CHECK(length(title) <= 120),
        startedAt TEXT NOT NULL,
        endedAt TEXT,
        originalStartedAt TEXT NOT NULL,
        originalEndedAt TEXT,
        adjustedAt TEXT,
        archivedAt TEXT
      );
      CREATE UNIQUE INDEX trading_one_active ON trading_sessions((1)) WHERE endedAt IS NULL;
      CREATE INDEX trading_recent ON trading_sessions(archivedAt, startedAt DESC, id DESC);
      CREATE TABLE trading_memberships (
        momentId TEXT PRIMARY KEY NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
        sessionId TEXT NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX trading_membership_timeline ON trading_memberships(sessionId, momentId);
      CREATE TABLE journal_writings (
        id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 64),
        momentId TEXT REFERENCES moments(id) ON DELETE CASCADE,
        sessionId TEXT REFERENCES trading_sessions(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('note', 'reflection')),
        text TEXT NOT NULL CHECK(length(text) <= 20000),
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        finalisedAt TEXT,
        revision INTEGER NOT NULL CHECK(revision >= 0),
        CHECK((momentId IS NULL) <> (sessionId IS NULL)),
        CHECK(kind <> 'note' OR momentId IS NOT NULL)
      );
      CREATE UNIQUE INDEX writing_one_note ON journal_writings(momentId) WHERE kind = 'note';
      CREATE INDEX writing_moment_recent ON journal_writings(momentId, COALESCE(finalisedAt, updatedAt) DESC, id DESC);
      CREATE INDEX writing_session_recent ON journal_writings(sessionId, COALESCE(finalisedAt, updatedAt) DESC, id DESC);
      PRAGMA user_version = 3;
    `);
  });
}
