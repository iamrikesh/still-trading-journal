import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { defaultDatabaseDirectory, openDatabaseAsync } from 'expo-sqlite';
import { createEncryptedJournalOpener } from './encryptedJournal.ts';
import { createMemoryJournal } from './memoryJournal.ts';
import { sqliteDirectoryUri } from './sqliteDirectoryUri.ts';
import type { JournalRepository } from './types.ts';

export const isTemporaryJournal = Constants.appOwnership === 'expo';
const databaseName = 'still-journal.db';
const keyName = 'still.journal.database-key.v1';
const keyOptions: SecureStore.SecureStoreOptions = {
  keychainService: 'still.journal',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const openEncrypted = createEncryptedJournalOpener({
  async hasExistingData() {
    // Check files without opening SQLite pages before keying. Include recovery
    // sidecars; unknown metadata also blocks creation instead of risking history.
    return ['', '-wal', '-journal', '-shm'].some((suffix) => {
      const info = new File(sqliteDirectoryUri(defaultDatabaseDirectory), databaseName + suffix).info();
      return info.exists && info.size !== 0;
    });
  },
  getKey: () => SecureStore.getItemAsync(keyName, keyOptions),
  storeKey: (key) => SecureStore.setItemAsync(keyName, key, keyOptions),
  randomBytes: () => Crypto.getRandomBytesAsync(32),
  openDatabase: () => openDatabaseAsync(databaseName, { useNewConnection: true }),
});

let demo: JournalRepository | undefined;

export async function openJournal(): Promise<JournalRepository> {
  if (isTemporaryJournal) {
    demo ??= createMemoryJournal();
    return demo;
  }
  return openEncrypted();
}
