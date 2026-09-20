import { createSqlJournal, type JournalDatabase } from './sqlJournal.ts';
import type { JournalRepository } from './types.ts';

export interface EncryptedDatabase extends JournalDatabase {
  closeAsync(): Promise<void>;
}

export interface EncryptionDependencies {
  hasExistingData(): Promise<boolean>;
  getKey(): Promise<string | null>;
  storeKey(key: string): Promise<void>;
  randomBytes(): Promise<Uint8Array>;
  openDatabase(): Promise<EncryptedDatabase>;
}

export function createEncryptedJournalOpener(dependencies: EncryptionDependencies): () => Promise<JournalRepository> {
  let pending: Promise<JournalRepository> | undefined;

  async function initialize(): Promise<JournalRepository> {
    let db: EncryptedDatabase | undefined;
    try {
      let key = await dependencies.getKey();
      if (key !== null && !/^[0-9a-f]{64}$/.test(key)) throw new Error('Invalid saved key.');
      if (key === null && await dependencies.hasExistingData()) {
        throw new Error('Existing journal key unavailable.');
      }
      db = await dependencies.openDatabase();
      // This capability PRAGMA does not read database pages. The key must be set
      // before any page access, including schema/version queries.
      const [cipher] = await db.getAllAsync<{ cipher_version: string }>('PRAGMA cipher_version');
      if (!cipher || typeof cipher.cipher_version !== 'string' || !cipher.cipher_version.trim()) {
        throw new Error('SQLCipher unavailable.');
      }
      if (key === null) {
        const bytes = await dependencies.randomBytes();
        if (bytes.length !== 32) throw new Error('Invalid key length.');
        key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        await dependencies.storeKey(key);
      }
      // PRAGMA cannot bind parameters. Only the validated 64 hex characters
      // reach this SQLCipher raw-key literal; moment content is always bound.
      await db.execAsync(`PRAGMA key = "x'${key}'"`);
      return await createSqlJournal(db);
    } catch {
      if (db) {
        try { await db.closeAsync(); } catch { /* Preserve the sanitized failure. */ }
      }
      // Native errors can contain SQL (including key material). Never surface
      // or log their messages, causes, or stacks across this boundary.
      throw new Error('Encrypted journal unavailable. Existing data has not been reset.');
    }
  }

  return () => {
    if (!pending) {
      pending = initialize().catch((error: unknown) => {
        pending = undefined;
        throw error;
      });
    }
    return pending;
  };
}
