import type { Clip, ClipCursor, ClipIntent } from '../storage/clipTypes.ts';
import type { JournalSession } from '../storage/journalSession.ts';
import type { Moment } from '../storage/types.ts';

type Phase = 'unavailable' | 'ready' | 'loading' | 'permission' | 'starting' | 'recording' | 'saving' | 'playing' | 'cleanup';
export type RecordingState = {
  momentId: string | null; phase: Phase; clips: Clip[]; durationMs: number;
  activeId: string | null; message: string | null; usageBytes: number; pending: number; older: boolean;
  pendingOwners: Moment[];
};
type Ports = { session(): Promise<JournalSession>; permission(): Promise<boolean>; id(): string; now(): string };

/** One owner for every screen. Native code enforces lifecycle/limits even when JS
 * is suspended; polling only updates UI and requests the durable commit. */
export function createRecordingController(ports: Ports) {
  let state: RecordingState = { momentId: null, phase: 'loading', clips: [], durationMs: 0, activeId: null, message: null, usageBytes: 0, pending: 0, older: false, pendingOwners: [] };
  const listeners = new Set<() => void>();
  let running: Promise<void> | null = null;
  let epoch = 0;
  let active: ClipIntent | null = null;
  let playingId: string | null = null;
  let foreground = true;
  let cursor: ClipCursor | undefined;
  function publish(patch: Partial<RecordingState>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); }
  async function session() {
    const value = await ports.session();
    if (!value.audio || !value.clips) throw new Error('Audio requires the updated Android development build.');
    return value as JournalSession & { audio: NonNullable<JournalSession['audio']>; clips: NonNullable<JournalSession['clips']> };
  }
  async function refresh() {
    const owner = state.momentId;
    const version = epoch;
    const s = await session();
    const clips = owner === null ? [] : await s.clips.list(owner, cursor);
    const usageBytes = await s.audio.usage();
    const { pending } = await s.recovery();
    const pendingOwners = pending ? await s.audio.pendingOwners() : [];
    if (version === epoch) publish({ clips, usageBytes, pending, pendingOwners, older: clips.length === 20 });
  }
  function run(work: () => Promise<void>) {
    if (running) return running;
    running = Promise.resolve().then(work).catch(() => {
      if (state.phase !== 'cleanup') publish({ message: 'Audio could not complete. Retry or discard the pending clip; saved moments are still available.' });
    }).finally(() => { running = null; });
    return running;
  }
  async function finishCapture() {
    const captured = active;
    if (!captured) return;
    publish({ phase: 'saving', message: null });
    try { await (await session()).audio.releaseCapture(captured.id); }
    catch {
      publish({ phase: 'cleanup', activeId: captured.id, message: 'Microphone release is not confirmed. Press Stop again. If it still fails, close the app process before recording again.' });
      return;
    }
    active = null; // Native release is confirmed, even if the encrypted save fails next.
    try {
      await (await session()).clips.finish(captured.id);
      publish({ message: 'Clip saved on this device.' });
    } catch {
      publish({ message: 'Clip not fully saved. Retry saving, or discard it if capture was empty or interrupted.' });
    } finally {
      active = null;
      publish({ phase: 'ready', activeId: null, durationMs: 0 });
      await refresh();
    }
  }
  async function finishPlayback() {
    if (!playingId) return;
    try { await (await session()).audio.stopPlayback(); }
    catch {
      publish({ phase: 'cleanup', activeId: playingId, message: 'Playback cleanup is not confirmed. Press Stop again. If it still fails, close the app process.' });
      return;
    }
    playingId = null;
    publish({ phase: 'ready', activeId: null, durationMs: 0 });
  }
  async function settle() { await finishCapture(); await finishPlayback(); }
  const controller = {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    async select(momentId: string | null) {
      const version = ++epoch;
      cursor = undefined;
      publish({ momentId, clips: [], older: false, message: null });
      if (running) await running;
      if (version !== epoch) return;
      await run(async () => {
        await settle();
        try { await refresh(); if (!active && !playingId) publish({ phase: 'ready' }); }
        catch { if (!active && !playingId) publish({ phase: 'unavailable', message: 'Recording needs the updated Android build and available clip storage.' }); }
      });
    },
    record() {
      if (running || state.phase !== 'ready' || state.momentId === null || !foreground) return Promise.resolve();
      if (state.pending) { publish({ message: 'Resolve pending clips before recording another. Open their moment to Retry or Discard.' }); return Promise.resolve(); }
      const owner = state.momentId;
      const version = epoch;
      publish({ phase: 'permission', message: null });
      return run(async () => {
        try {
          const allowed = await ports.permission();
          if (version !== epoch || !foreground) return;
          if (!allowed) { publish({ message: 'Microphone permission was not granted. Your moment is saved; you can allow access in Android Settings.' }); return; }
          const s = await session();
          if (version !== epoch || !foreground) return;
          const intent = { id: ports.id(), momentId: owner, createdAt: ports.now() };
          publish({ phase: 'starting' });
          // Keep ownership before awaiting native start, including uncertain failures.
          active = intent;
          await s.audio.start(intent);
          publish({ phase: 'recording', activeId: intent.id, durationMs: 0 });
          if (version !== epoch || !foreground) await finishCapture();
        } catch {
          if (active) {
            try {
              const status = await (await session()).audio.status();
              if (status.id !== active.id) active = null;
              else await finishCapture();
            } catch {
              publish({ phase: 'cleanup', activeId: active?.id ?? null, message: 'Microphone cleanup is not confirmed. Press Stop again before continuing.' });
            }
          }
          if (!active) publish({ message: 'Recording could not start. Check microphone access and free space. Any pending clip can be retried or discarded.' });
        } finally {
          if (!active) publish({ phase: 'ready', activeId: null });
          await refresh();
        }
      });
    },
    async stop() {
      // An explicit stop must outlive a timer poll or a still-settling start.
      ++epoch;
      if (running) await running;
      await run(settle);
    },
    retry(id: string) {
      if (running || active || playingId) return Promise.resolve();
      return run(async () => {
        publish({ phase: 'saving', message: null });
        try { await (await session()).clips.finish(id); publish({ message: 'Clip saved on this device.' }); }
        finally { publish({ phase: 'ready' }); await refresh(); }
      });
    },
    remove(id: string) {
      if (running || active) return Promise.resolve();
      return run(async () => {
        await finishPlayback();
        try { await (await session()).clips.remove(id); publish({ message: 'Clip deleted.' }); }
        finally { await refresh(); }
      });
    },
    recover() {
      if (running || active || playingId) return Promise.resolve();
      return run(async () => {
        publish({ phase: 'saving', message: null });
        try {
          const result = await (await session()).clips.recover();
          publish({ message: result.pending ? 'Some clips still need attention. Open a pending moment below to retry or discard.' : 'Pending clip work completed.' });
        } finally { publish({ phase: 'ready' }); await refresh(); }
      });
    },
    play(id: string) {
      if (running || state.phase !== 'ready' || !foreground) return Promise.resolve();
      return run(async () => {
        publish({ phase: 'loading', message: null });
        try {
          playingId = id;
          await (await session()).audio.play(id);
          publish({ phase: 'playing', activeId: id, durationMs: 0 });
          if (!foreground) await finishPlayback();
        } catch {
          await finishPlayback();
          throw new Error('Playback unavailable');
        }
      });
    },
    async background() {
      // Invalidate pending permission/start work even if we return before it
      // resolves. Foreground admission alone cannot reject that stale request.
      foreground = false; ++epoch;
      if (running) await running;
      await run(settle);
    },
    foreground() { foreground = true; return controller.poll(); },
    poll() {
      if (running || state.phase === 'cleanup' || (!active && !playingId)) return Promise.resolve();
      return run(async () => {
        const status = await (await session()).audio.status();
        if (active) {
          if (status.id === active.id && status.state === 'recording') publish({ durationMs: status.durationMs });
          else await finishCapture();
        } else if (playingId) {
          if (status.id === playingId && status.state === 'playing') publish({ durationMs: status.durationMs });
          else await finishPlayback();
        }
      });
    },
    page(older: boolean) {
      if (running || active || playingId) return Promise.resolve();
      const last = state.clips.at(-1);
      cursor = older && last ? { id: last.id, createdAt: last.createdAt } : undefined;
      return run(refresh);
    },
  };
  return controller;
}
export type RecordingController = ReturnType<typeof createRecordingController>;
