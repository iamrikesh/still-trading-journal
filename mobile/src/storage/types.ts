export type Moment = {
  id: string;
  emotionId: string;
  emotionLabel: string;
  createdAt: string;
  supportText: string;
};

export interface JournalRepository {
  save(moment: Moment): Promise<void>;
  list(): Promise<Moment[]>;
  remove(id: string): Promise<void>;
}
