import { emotions } from '../journal/emotions.ts';
import { clipTransaction } from './clipSchema.ts';
import type { JournalDatabase } from './sqlJournal.ts';

/** Schema 4 adds editable cards and encrypted bounded payloads to the existing
 * keyed connection. Seed and version advance are one transaction. */
export async function migrateReminderSchema(db: JournalDatabase): Promise<void> {
  const [version] = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
  if (version?.user_version === 4) return;
  if (version?.user_version !== 3) throw new Error('Unsupported reminder schema.');
  await clipTransaction(db, async () => {
    await db.execAsync(`
      CREATE TABLE reminder_payloads (
        id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-z0-9-]*'),
        kind TEXT NOT NULL CHECK(kind IN ('image', 'audio')),
        mime TEXT NOT NULL,
        bytes INTEGER NOT NULL CHECK(typeof(bytes) = 'integer' AND bytes BETWEEN 1 AND 4194304),
        base64 TEXT NOT NULL,
        width INTEGER, height INTEGER, durationMs INTEGER
      );
      CREATE TABLE emotion_cards (
        id TEXT PRIMARY KEY NOT NULL CHECK(length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-z0-9-]*'),
        label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 40),
        hint TEXT NOT NULL CHECK(length(hint) <= 120),
        symbol TEXT NOT NULL CHECK(length(symbol) <= 8),
        support TEXT NOT NULL CHECK(length(support) <= 4000),
        action TEXT NOT NULL CHECK(length(action) <= 500),
        position INTEGER NOT NULL CHECK(typeof(position) = 'integer' AND position >= 0),
        archived INTEGER NOT NULL CHECK(archived IN (0, 1)),
        revision INTEGER NOT NULL CHECK(typeof(revision) = 'integer' AND revision >= 0),
        imageId TEXT REFERENCES reminder_payloads(id) ON DELETE RESTRICT,
        audioId TEXT REFERENCES reminder_payloads(id) ON DELETE RESTRICT
      );
      CREATE INDEX emotion_cards_order ON emotion_cards(archived, position, id);
      CREATE TABLE appearance_preference (
        singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton = 1),
        value TEXT NOT NULL CHECK(value IN ('system', 'light', 'dark'))
      );
      INSERT INTO appearance_preference(singleton, value) VALUES (1, 'system');
    `);
    for (const [position, card] of emotions.entries()) {
      await db.runAsync(`INSERT INTO emotion_cards
        (id,label,hint,symbol,support,action,position,archived,revision,imageId,audioId)
        VALUES (?,?,?,?,?,?,?,0,0,NULL,NULL)`,
      card.id, card.label, card.hint, card.symbol, card.support, card.action, String(position));
    }
    await db.execAsync('PRAGMA user_version = 4');
  });
}
