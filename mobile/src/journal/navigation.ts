export type Page = 'now' | 'support' | 'history' | 'clips' | 'sessions' | 'writing' | 'settings' | 'reminders' | 'editor';

/** Back follows the task's entry point; reaching Now hands Back to Android. */
export function backDestination(page: Page, writingOrigin: Page): Page | null {
  if (page === 'now') return null;
  if (page === 'writing') return writingOrigin;
  if (page === 'editor') return 'reminders';
  if (page === 'reminders') return 'settings';
  if (page === 'clips') return 'history';
  return 'now';
}

/** Reopen current support after leaving writing, without capturing another moment. */
export async function restoreSupport(reminder: ReminderController, cardId: string) {
  const card = reminder.getSnapshot().active.find(value => value.id === cardId);
  if (card) await reminder.selectSupport(card);
}
import type { ReminderController } from '../reminders/controller.ts';
