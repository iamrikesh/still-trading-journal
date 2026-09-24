export type Moment = {
  id: string;
  emotionId: string;
  emotionLabel: string;
  createdAt: string;
  supportText: string;
};

export type MomentCursor = Pick<Moment, 'createdAt' | 'id'>;

export interface JournalRepository {
  save(moment: Moment): Promise<void>;
  list(before?: MomentCursor): Promise<Moment[]>;
  remove(id: string): Promise<void>;
}
