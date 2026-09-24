import type { Emotion } from '../journal/emotions.ts';
import type { ImportedReminder } from '../reminders/nativeReminders.ts';

export type ReminderAttachment = ImportedReminder & { id: string };
export type EmotionCard = Emotion & {
  position: number;
  archived: boolean;
  revision: number;
  imageId: string | null;
  audioId: string | null;
};
export type ReminderSave = { card: EmotionCard; image?: ReminderAttachment | null; audio?: ReminderAttachment | null };
export interface ReminderRepository {
  list(archived?: boolean): Promise<EmotionCard[]>;
  save(input: ReminderSave): Promise<EmotionCard>;
  move(id: string, direction: 'up' | 'down'): Promise<void>;
  archive(id: string, archived: boolean): Promise<void>;
  attachment(id: string): Promise<ReminderAttachment | null>;
  usage(): Promise<number>;
}
export type Appearance = 'system' | 'light' | 'dark';
export interface AppearanceRepository {
  get(): Promise<Appearance>;
  set(value: Appearance): Promise<void>;
}
