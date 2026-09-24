import type { Emotion } from './emotions.ts';
import type { HistoryMoment, JournalRepository, Moment, MomentCursor } from '../storage/types.ts';

export type JournalState = {
  selected: Emotion | null;
  moment: Moment | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  saveError: 'capacity' | 'capture' | 'write' | null;
  history: HistoryMoment[];
  historyStatus: 'loading' | 'ready' | 'failed';
  olderStatus: 'idle' | 'loading' | 'end' | 'failed';
  failed: Moment[];
};

export function createJournalController(deps: {
  repository: () => Promise<JournalRepository>;
  now: () => string;
  id: () => string;
}) {
  let state: JournalState = { selected: null, moment: null, saveStatus: 'idle', saveError: null, history: [], historyStatus: 'loading', olderStatus: 'idle', failed: [] };
  const listeners = new Set<() => void>();
  let latestRead = 0;
  let cursor: MomentCursor | null = null;
  let historyKnown = false;
  const saving = new Set<string>();
  function update(patch: Partial<JournalState>) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  async function refresh() {
    const request = ++latestRead;
    update({ historyStatus: 'loading', olderStatus: 'idle' });
    try {
      const repository = await deps.repository();
      const history = await repository.list();
      if (request === latestRead) {
        const last = history.at(-1);
        cursor = last ? { createdAt: last.createdAt, id: last.id } : null;
        historyKnown = true;
        update({ history, historyStatus: 'ready', olderStatus: history.length < 50 ? 'end' : 'idle' });
      }
    } catch {
      if (request === latestRead) update({ historyStatus: 'failed' });
    }
  }
  async function older() {
    if (state.historyStatus !== 'ready' || state.olderStatus === 'loading' || state.olderStatus === 'end' || !cursor) return;
    const request = latestRead;
    const before = { ...cursor };
    update({ olderStatus: 'loading' });
    try {
      const repository = await deps.repository();
      const page = await repository.list(before);
      if (request !== latestRead) return;
      const seen = new Set(state.history.map(row => row.id));
      const appended = page.filter(row => { if (seen.has(row.id)) return false; seen.add(row.id); return true; });
      const last = page.at(-1);
      if (last) cursor = { createdAt: last.createdAt, id: last.id };
      update({ history: [...state.history, ...appended], olderStatus: page.length < 50 ? 'end' : 'idle' });
    } catch {
      if (request === latestRead) update({ olderStatus: 'failed' });
    }
  }
  async function remove(id: string): Promise<void> {
    const request = ++latestRead;
    const previousHistoryStatus = state.historyStatus;
    const previousOlderStatus = state.olderStatus;
    update({ olderStatus: 'idle' });
    try {
      const repository = await deps.repository();
      await repository.remove(id);
    } catch (error) {
      if (request === latestRead) update({
        historyStatus: previousHistoryStatus === 'loading' ? (historyKnown ? 'ready' : 'failed') : previousHistoryStatus,
        olderStatus: previousOlderStatus === 'loading' ? 'idle' : previousOlderStatus,
      });
      throw error;
    }
    update({ history: state.history.filter(row => row.id !== id) });
    await refresh();
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
    older,
    remove,
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
