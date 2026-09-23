import { randomUUID } from 'expo-crypto';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { createRecordingController } from './controller';
import { openJournalSession } from '../storage/openJournal';

export function createAppRecordingController() {
  return createRecordingController({
    session: openJournalSession,
    async permission() {
      // Requesting an existing grant can still trigger Android lifecycle events.
      if ((await getRecordingPermissionsAsync()).granted) return true;
      return (await requestRecordingPermissionsAsync()).granted;
    },
    id: randomUUID, now: () => new Date().toISOString(),
  });
}
