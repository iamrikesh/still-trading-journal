export type Moment = {
  id: string;
  emotionId: string;
  emotionLabel: string;
  createdAt: string;
  supportText: string;
};

export type MomentCursor = Pick<Moment, 'createdAt' | 'id'>;
export type HistoryMoment = Moment & { session?: { title: string; startedAt: string; archivedAt: string | null } };

export interface JournalRepository {
  save(moment: Moment): Promise<void>;
  list(before?: MomentCursor): Promise<HistoryMoment[]>;
  remove(id: string): Promise<void>;
}
