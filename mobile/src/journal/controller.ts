import type { Emotion } from './emotions.ts';
import type { JournalRepository, Moment } from '../storage/types.ts';

export type JournalState = {
  selected: Emotion | null;
  moment: Moment | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  saveError: 'capacity' | 'capture' | 'write' | null;
  history: Moment[];
  historyStatus: 'loading' | 'ready' | 'failed';
  failed: Moment[];
};

export function createJournalController(deps: {
  repository: () => Promise<JournalRepository>;
  now: () => string;
  id: () => string;
}) {
  let state: JournalState = { selected: null, moment: null, saveStatus: 'idle', saveError: null, history: [], historyStatus: 'loading', failed: [] };
  const listeners = new Set<() => void>();
  let latestRead = 0;
  const saving = new Set<string>();
  function update(patch: Partial<JournalState>) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  async function refresh() {
    const request = ++latestRead;
    try {
      const repository = await deps.repository();
      const history = await repository.list();
      if (request === latestRead) update({ history, historyStatus: 'ready' });
    } catch {
      if (request === latestRead) update({ historyStatus: 'failed' });
    }
  }
  async function persist(moment: Moment) {
    if (saving.has(moment.id)) return;
    saving.add(moment.id);
    try {
      const repository = await deps.repository();
      await repository.save(moment);
      update({
        ...(state.moment?.id === moment.id ? { saveStatus: 'saved' as const, saveError: null } : {}),
        failed: state.failed.filter(item => item.id !== moment.id),
      });
    } catch {
      update({
        ...(state.moment?.id === moment.id ? { saveStatus: 'failed' as const, saveError: 'write' as const } : {}),
        failed: [...state.failed.filter(item => item.id !== moment.id), moment],
      });
      return;
    } finally {
      saving.delete(moment.id);
    }
    await refresh();
  }
  return {
    getSnapshot: () => state,
    refresh,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    tap: async (emotion: Emotion) => {
      const pendingIds = new Set([...saving, ...state.failed.map(item => item.id)]);
      if (pendingIds.size >= 50) {
        update({ selected: emotion, moment: null, saveStatus: 'failed', saveError: 'capacity' });
        return;
      }
      let moment: Moment;
      try {
        moment = { id: deps.id(), emotionId: emotion.id, emotionLabel: emotion.label, createdAt: deps.now(), supportText: emotion.support };
      } catch {
        update({ selected: emotion, moment: null, saveStatus: 'failed', saveError: 'capture' });
        return;
      }
      update({ selected: emotion, moment, saveStatus: 'saving', saveError: null });
      await persist(moment);
    },
    retry: async (id: string) => {
      const moment = state.failed.find(item => item.id === id);
      if (moment) {
        if (state.moment?.id === id) update({ saveStatus: 'saving', saveError: null });
        await persist(moment);
      }
    },
  };
}
