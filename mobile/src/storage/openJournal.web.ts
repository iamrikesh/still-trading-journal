import { createMemoryJournal } from './memoryJournal.ts';
import type { JournalRepository } from './types.ts';
import { runtimeSession, type JournalSession } from './journalSession.ts';

export const isTemporaryJournal = true;
export const openJournalSession = runtimeSession<JournalSession>(globalThis, async () => ({
  journal: createMemoryJournal(), clips: null, exercise: null, recovery: async () => ({ pending: 0 }),
}));

export async function openJournal(): Promise<JournalRepository> {
  return (await openJournalSession()).journal;
}
