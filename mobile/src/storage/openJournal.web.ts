import { createMemoryJournal } from './memoryJournal.ts';
import type { JournalRepository } from './types.ts';

export const isTemporaryJournal = true;
const demo = createMemoryJournal();

export async function openJournal(): Promise<JournalRepository> {
  return demo;
}
