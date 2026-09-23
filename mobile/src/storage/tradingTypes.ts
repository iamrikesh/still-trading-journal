import type { Moment } from './types.ts';

export type TradingSession = { id: string; title: string; startedAt: string; endedAt: string | null; originalStartedAt: string; originalEndedAt: string | null; adjustedAt: string | null; archivedAt: string | null };
export type TradingCursor = { at: string; id: string };
export type WritingOwner = { kind: 'moment' | 'session'; id: string };
export type Writing = { id: string; owner: WritingOwner; kind: 'note' | 'reflection'; text: string; createdAt: string; updatedAt: string; finalisedAt: string | null; revision: number };
export interface TradingRepository {
  active(): Promise<TradingSession | null>;
  start(input: { id: string; title: string; at: string }): Promise<TradingSession>;
  end(id: string, at: string): Promise<void>;
  adjust(id: string, input: { title: string; startedAt: string; endedAt: string | null; at: string }): Promise<void>;
  archive(id: string, archived: boolean, at: string): Promise<void>;
  sessions(archived: boolean, before?: TradingCursor): Promise<TradingSession[]>;
  assign(momentId: string, sessionId: string | null): Promise<void>;
  membership(momentId: string): Promise<TradingSession | null>;
  timeline(sessionId: string, before?: TradingCursor): Promise<Moment[]>;
  writings(owner: WritingOwner, before?: TradingCursor): Promise<Writing[]>;
  saveDraft(input: Writing): Promise<Writing>;
  finalise(id: string, text: string, revision: number, at: string): Promise<Writing>;
  discardDraft(id: string): Promise<void>;
}
