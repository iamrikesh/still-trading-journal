import { randomUUID } from 'expo-crypto';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { createRecordingController } from './controller';
import { openJournalSession } from '../storage/openJournal';

export function createAppRecordingController() {
  return createRecordingController({
    session: openJournalSession,
    async permission() {
      return (await requestRecordingPermissionsAsync()).granted;
    },
    id: randomUUID, now: () => new Date().toISOString(),
  });
}
