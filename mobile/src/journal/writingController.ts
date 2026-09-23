import type { TradingRepository, Writing, WritingOwner } from '../storage/tradingTypes.ts';

export async function findOpeningWriting(repository: TradingRepository, owner: WritingOwner, kind: Writing['kind'], first: Writing[]): Promise<Writing | undefined> {
  let page = first;
  for (;;) {
    const found = kind === 'note' ? page.find(row => row.kind === 'note') : page.find(row => row.kind === 'reflection' && !row.finalisedAt);
    if (found) return found;
    if (page.length < 30) return undefined;
    const last = page.at(-1)!;
    page = await repository.writings(owner, { at: last.finalisedAt ?? last.updatedAt, id: last.id });
  }
}
export async function findWritingById(repository: TradingRepository, owner: WritingOwner, id: string): Promise<Writing | undefined> {
  let page = await repository.writings(owner);
  for (;;) {
    const found = page.find(row => row.id === id);
    if (found) return found;
    if (page.length < 30) return undefined;
    const last = page.at(-1)!;
    page = await repository.writings(owner, { at: last.finalisedAt ?? last.updatedAt, id: last.id });
  }
}

type State = { writing: Writing | null; text: string; status: 'Saving' | 'Saved draft' | 'Not saved' | 'Finalised'; error: string | null; busy: boolean };
export function createWritingController(deps: { repository(): Promise<TradingRepository>; id(): string; now(): string }) {
  let state: State = { writing: null, text: '', status: 'Saved draft', error: null, busy: false };
  const listeners = new Set<() => void>();
  let generation = 0;
  let tail: Promise<void> = Promise.resolve();
  let finalising: Promise<void> | null = null;
  function update(patch: Partial<State>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
  function canSwitch(owner: WritingOwner, kind: Writing['kind'], saved?: Writing) {
    return !state.busy && !(['Saving', 'Not saved'].includes(state.status) && state.writing &&
      (state.writing.owner.id !== owner.id || state.writing.owner.kind !== owner.kind || state.writing.kind !== kind || saved && saved.id !== state.writing.id));
  }
  function queue(work: () => Promise<void>) { const result = tail.catch(() => undefined).then(work); tail = result.catch(() => undefined); return result; }
  function save(snapshot: Writing, token: number) { return queue(async () => {
    try {
      const result = await (await deps.repository()).saveDraft(snapshot);
      if (token === generation && state.writing?.id === result.id && state.writing.revision === result.revision) update({ writing: result, status: 'Saved draft' });
    } catch {
      if (token === generation && state.writing?.revision === snapshot.revision) update({ status: 'Not saved', error: 'Draft not saved. Your text is still here; retry saving.' });
    }
  }); }
  const controller = {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, getSnapshot: () => state,
    canSwitch,
    version: () => generation,
    openIfCurrent(version: number, owner: WritingOwner, kind: Writing['kind'], saved?: Writing) {
      if (version !== generation) return false;
      return controller.open(owner, kind, saved);
    },
    open(owner: WritingOwner, kind: Writing['kind'], saved?: Writing) {
      if (!canSwitch(owner, kind, saved)) {
        update({ error: 'Save or retry this draft before switching writing.' }); return false;
      }
      if (['Saving', 'Not saved'].includes(state.status) && state.writing) return true;
      if (saved && state.writing?.id === saved.id && state.writing.revision > saved.revision) return true;
      ++generation;
      const writing: Writing = saved ?? { id: deps.id(), owner, kind, text: '', createdAt: deps.now(), updatedAt: deps.now(), finalisedAt: null, revision: 0 };
      update({ writing, text: writing.text, status: writing.finalisedAt ? 'Finalised' : 'Saved draft', error: null, busy: false });
      return true;
    },
    edit(text: string) {
      const current = state.writing;
      if (!current || current.finalisedAt || state.busy) return Promise.resolve();
      const token = generation;
      const snapshot = { ...current, owner: { ...current.owner }, text, updatedAt: deps.now(), revision: current.revision + 1 };
      update({ writing: snapshot, text, status: 'Saving', error: null });
      return save(snapshot, token);
    },
    retry() { return controller.edit(state.text); },
    async background() { await tail; if (state.status === 'Not saved') await controller.retry(); },
    done() {
      if (finalising) return finalising;
      if (state.busy) return Promise.resolve();
      if (!state.writing || state.writing.finalisedAt) return Promise.resolve();
      if (!state.text.trim()) { update({ error: 'Add some text before Done.' }); return Promise.resolve(); }
      const token = generation;
      update({ busy: true, error: null });
      finalising = (async () => {
        await tail;
        if (token !== generation || !state.writing) return;
        if (state.status === 'Not saved') {
          const current = state.writing;
          const snapshot = { ...current, owner: { ...current.owner }, text: state.text, updatedAt: deps.now(), revision: current.revision + 1 };
          update({ writing: snapshot, status: 'Saving', error: null });
          await save(snapshot, token);
        }
        if (token !== generation || !state.writing || state.status === 'Not saved') return;
        try {
          const result = await (await deps.repository()).finalise(state.writing.id, state.text, state.writing.revision, deps.now());
          if (token === generation) update({ writing: result, text: result.text, status: 'Finalised' });
        } catch { if (token === generation) update({ error: 'Could not finish writing. Your draft is still here; try Done again.' }); }
      })().finally(() => { finalising = null; if (token === generation) update({ busy: false }); });
      return finalising;
    },
    async discard() {
      if (!state.writing || state.writing.finalisedAt || state.busy) return;
      const id = state.writing.id;
      const token = ++generation;
      update({ busy: true, error: null });
      try { await tail; await (await deps.repository()).discardDraft(id); if (token === generation && state.writing?.id === id) update({ writing: null, text: '', status: 'Saved draft' }); }
      catch { if (token === generation && state.writing?.id === id) update({ error: 'Could not discard the draft. Please try again.' }); }
      finally { if (token === generation) update({ busy: false }); }
    },
  };
  return controller;
}
export type WritingController = ReturnType<typeof createWritingController>;
