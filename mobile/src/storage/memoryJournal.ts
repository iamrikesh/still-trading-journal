import type { JournalRepository, Moment } from './types.ts';

export function createMemoryJournal(): JournalRepository {
  let moments: Moment[] = [];
  return {
    async save(moment) {
      if (moments.some((saved) => saved.id === moment.id)) return;
      moments = [...moments, { ...moment }].sort((left, right) => {
        if (left.createdAt !== right.createdAt) return left.createdAt > right.createdAt ? -1 : 1;
        return left.id === right.id ? 0 : left.id > right.id ? -1 : 1;
      }).slice(0, 50);
    },
    async list() { return moments.map((moment) => ({ ...moment })); },
    async remove(id) { moments = moments.filter((moment) => moment.id !== id); },
  };
}
