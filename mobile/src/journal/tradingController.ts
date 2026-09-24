import type { Moment } from '../storage/types.ts';
import type { TradingCursor, TradingRepository, TradingSession } from '../storage/tradingTypes.ts';

type State = { active: TradingSession | null; sessions: TradingSession[]; archived: TradingSession[]; timeline: Moment[]; timelineStatus: 'idle' | 'loading' | 'ready' | 'failed' | 'loadingOlder' | 'failedOlder'; busy: boolean; error: string | null; acknowledged: boolean; moreSessions: boolean; moreArchived: boolean; moreTimeline: boolean };
type RecordingBoundary = { stopForSessionEnd(): Promise<boolean> };
export function createTradingController(deps: { repository(): Promise<TradingRepository>; recording: RecordingBoundary; id(): string; now(): string }) {
  let state: State = { active: null, sessions: [], archived: [], timeline: [], timelineStatus: 'idle', busy: false, error: null, acknowledged: false, moreSessions: false, moreArchived: false, moreTimeline: false };
  const listeners = new Set<() => void>();
  let locked = false;
  let view = 0;
  let timelineOwner: string | null = null;
  function update(patch: Partial<State>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
  async function operate(work: () => Promise<void>) {
    if (locked) return;
    locked = true; update({ busy: true, error: null });
    try { await work(); } catch { update({ error: 'Could not save this change. Please try again.' }); }
    finally { locked = false; update({ busy: false }); }
  }
  async function loadSessions(archived = false, older = false) {
    const target = archived ? state.archived : state.sessions;
    const last = older ? target.at(-1) : undefined;
    const before: TradingCursor | undefined = last ? { at: last.startedAt, id: last.id } : undefined;
    try {
      const rows = await (await deps.repository()).sessions(archived, before);
      update(archived ? { archived: older ? [...target, ...rows] : rows, moreArchived: rows.length === 30 } : { sessions: older ? [...target, ...rows] : rows, moreSessions: rows.length === 30 });
    } catch { update({ error: 'Sessions could not load. Please try again.' }); }
  }
  const controller = {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, getSnapshot: () => state,
    async refresh() { try { update({ active: await (await deps.repository()).active() }); await loadSessions(); } catch { update({ error: 'Sessions could not load. Please try again.' }); } },
    loadSessions,
    start(title: string) { return operate(async () => {
      const repo = await deps.repository();
      const existing = await repo.active();
      if (existing) { update({ active: existing, error: 'A session is already open.' }); return; }
      const active = await repo.start({ id: deps.id(), title: title.trim(), at: deps.now() });
      update({ active, acknowledged: true }); await loadSessions();
    }); },
    end() {
      // stopForSessionEnd invalidates Record synchronously before its first await.
      if (locked || !state.active) return Promise.resolve();
      const release = deps.recording.stopForSessionEnd();
      return operate(async () => {
        if (!await release) { update({ error: 'Audio release is unconfirmed. Press Stop again, then retry End.' }); return; }
        const current = state.active;
        if (!current) return;
        await (await deps.repository()).end(current.id, deps.now());
        update({ active: null, acknowledged: false }); await loadSessions();
      });
    },
    resume() { update({ acknowledged: true }); },
    adjust(id: string, input: { title: string; startedAt: string; endedAt: string | null }) { return operate(async () => {
      const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/i;
      if (!explicitZone.test(input.startedAt) || !Number.isFinite(Date.parse(input.startedAt)) || (input.endedAt && (!explicitZone.test(input.endedAt) || !Number.isFinite(Date.parse(input.endedAt)) || Date.parse(input.endedAt) < Date.parse(input.startedAt)))) {
        update({ error: 'Enter valid times; End must be on or after Start.' }); return;
      }
      await (await deps.repository()).adjust(id, { ...input, startedAt: new Date(input.startedAt).toISOString(), endedAt: input.endedAt ? new Date(input.endedAt).toISOString() : null, at: deps.now() });
      update({ active: await (await deps.repository()).active() }); await loadSessions();
    }); },
    archive(id: string, archived: boolean) { return operate(async () => {
      await (await deps.repository()).archive(id, archived, deps.now()); await loadSessions(); await loadSessions(true);
    }); },
    assign(momentId: string, sessionId: string | null) { return operate(async () => { await (await deps.repository()).assign(momentId, sessionId); }); },
    async timeline(id: string, older = false) {
      if (older && (timelineOwner !== id || !['ready', 'failedOlder'].includes(state.timelineStatus) || !state.moreTimeline)) return;
      const request = ++view;
      const last = older ? state.timeline.at(-1) : undefined;
      if (!older) {
        timelineOwner = id;
        update({ timeline: [], moreTimeline: false, timelineStatus: 'loading', error: null });
      } else update({ timelineStatus: 'loadingOlder' });
      try {
        const rows = await (await deps.repository()).timeline(id, last ? { at: last.createdAt, id: last.id } : undefined);
        if (request === view && timelineOwner === id) {
          update({ timeline: older ? [...state.timeline, ...rows] : rows, moreTimeline: rows.length === 30, timelineStatus: 'ready' });
        }
      } catch { if (request === view && timelineOwner === id) update({ timelineStatus: older ? 'failedOlder' : 'failed' }); }
    },
  };
  return controller;
}
export type TradingController = ReturnType<typeof createTradingController>;
