import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { defaultDatabaseDirectory, openDatabaseAsync } from 'expo-sqlite';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { createEncryptedOpener } from './encryptedJournal.ts';
import { createJournalSession, runtimeSession, type JournalSession } from './journalSession.ts';
import { createNativeClipVault } from './nativeClipVault.ts';
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

const openEncrypted = createEncryptedOpener({
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
}, db => createJournalSession(db, createNativeClipVault(requireOptionalNativeModule('StillMediaVault')), {
  debug: __DEV__, id: Crypto.randomUUID, now: () => new Date().toISOString(),
}));

// One connection/queue per JS runtime, including React remounts and Fast Refresh.
// Upgrading from the previous opener requires a cold process launch after install.
export const openJournalSession = runtimeSession<JournalSession>(globalThis, async () => {
  if (isTemporaryJournal) return { journal: createMemoryJournal(), clips: null, exercise: null, recovery: async () => ({ pending: 0 }) };
  return openEncrypted();
});

export async function openJournal(): Promise<JournalRepository> {
  return (await openJournalSession()).journal;
}
