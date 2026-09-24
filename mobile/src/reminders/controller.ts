import type { NativeReminders } from './nativeReminders.ts';
import type { Appearance, AppearanceRepository, EmotionCard, ReminderAttachment, ReminderRepository } from '../storage/reminderTypes.ts';

export type ReminderDraft = {
  card: EmotionCard;
  image?: ReminderAttachment | null;
  audio?: ReminderAttachment | null;
  imagePreview: ReminderAttachment | null;
};
export type ReminderState = {
  active: EmotionCard[]; archived: EmotionCard[]; loadStatus: 'loading' | 'ready' | 'unavailable' | 'failed';
  selected: EmotionCard | null; supportImage: ReminderAttachment | null;
  draft: ReminderDraft | null; dirty: boolean; busy: 'idle' | 'importing' | 'saving';
  playing: 'idle' | 'loading' | 'playing' | 'cleanup'; durationMs: number;
  usageBytes: number; error: string | null;
};
type Ports = {
  repository(): Promise<ReminderRepository | null>;
  native: NativeReminders | null;
  recording: { stopForSessionEnd(): Promise<boolean> };
  id(): string;
};
type TextField = 'label' | 'hint' | 'symbol' | 'support' | 'action';
const limits: Record<TextField, number> = { label: 40, hint: 120, symbol: 8, support: 4000, action: 500 };
const safeError = 'Reminder change unavailable. Your saved card has not changed.';

export function createReminderController(ports: Ports) {
  let state: ReminderState = { active: [], archived: [], loadStatus: 'loading', selected: null, supportImage: null,
    draft: null, dirty: false, busy: 'idle', playing: 'idle', durationMs: 0, usageBytes: 0, error: null };
  const listeners = new Set<() => void>();
  let original: EmotionCard | null = null;
  let editEpoch = 0;
  let importEpoch = 0;
  let supportEpoch = 0;
  let playEpoch = 0;
  let foreground = true;
  let readEpoch = 0;
  let stopTask: Promise<boolean> = Promise.resolve(true);
  let pendingNativeStop: Promise<boolean> | null = null;
  function publish(patch: Partial<ReminderState>) { state = { ...state, ...patch }; listeners.forEach(listener => listener()); }
  function isDirty(draft: ReminderDraft | null) {
    if (!draft) return false;
    if (!original) return true;
    return (['label', 'hint', 'symbol', 'support', 'action'] as const).some(key => draft.card[key] !== original![key]) ||
      draft.image !== undefined || draft.audio !== undefined;
  }
  async function repository() {
    const value = await ports.repository();
    if (!value) throw Error('Reminders need the Android development build.');
    return value;
  }
  async function refresh() {
    const token = ++readEpoch;
    try {
      const repo = await repository();
      const [active, archived, usageBytes] = await Promise.all([repo.list(false), repo.list(true), repo.usage()]);
      if (token !== readEpoch) return;
      const selected = state.selected && active.concat(archived).find(row => row.id === state.selected!.id) || state.selected;
      publish({ active, archived, usageBytes, selected, loadStatus: 'ready', error: null });
    } catch {
      if (token === readEpoch) publish({ loadStatus: ports.native ? 'failed' : 'unavailable', error: 'Saved reminders could not load. Try again.' });
    }
  }
  function discard() {
    if (state.busy === 'saving') return false;
    ++editEpoch; ++importEpoch; original = null;
    publish({ draft: null, dirty: false, busy: 'idle', error: null });
    return true;
  }
  function edit(card: EmotionCard) {
    if (state.busy === 'saving') return;
    ++editEpoch; ++importEpoch; original = { ...card };
    const draft: ReminderDraft = { card: { ...card }, imagePreview: null };
    publish({ draft, dirty: false, busy: 'idle', error: null });
    if (card.imageId) void loadDraftImage(card.imageId, editEpoch);
  }
  async function loadDraftImage(id: string, token: number) {
    try {
      const value = await (await repository()).attachment(id);
      if (token !== editEpoch || !state.draft || state.draft.card.imageId !== id || state.draft.image !== undefined) return;
      publish({ draft: { ...state.draft, imagePreview: value } });
    } catch {
      if (token === editEpoch) publish({ error: 'Image preview could not load. The saved image is unchanged.' });
    }
  }
  function add() {
    if (state.busy === 'saving') return false;
    if (state.active.length + state.archived.length >= 40) {
      publish({ error: 'The 40 button limit is reached. Archive does not remove a saved button.' });
      return false;
    }
    ++editEpoch; ++importEpoch; original = null;
    publish({ draft: { card: { id: ports.id(), label: '', hint: '', symbol: '', support: '', action: '', position: 0,
      archived: false, revision: 0, imageId: null, audioId: null }, imagePreview: null }, dirty: true, busy: 'idle', error: null });
    return true;
  }
  function change(field: TextField, value: string) {
    if (!state.draft || state.busy === 'saving') return;
    const draft = { ...state.draft, card: { ...state.draft.card, [field]: value } };
    publish({ draft, dirty: isDirty(draft), error: null });
  }
  function removeMedia(kind: 'image' | 'audio') {
    if (!state.draft || state.busy === 'saving') return;
    ++importEpoch;
    const draft = { ...state.draft, [kind]: null,
      ...(kind === 'image' ? { imagePreview: null } : {}) };
    publish({ draft, dirty: isDirty(draft), busy: 'idle', error: null });
  }
  async function importMedia(kind: 'image' | 'audio') {
    if (!state.draft || state.busy !== 'idle') return;
    if (!ports.native) { publish({ error: 'Media import needs the Android development build.' }); return; }
    const token = ++importEpoch;
    const owner = editEpoch;
    publish({ busy: 'importing', error: null });
    try {
      const picked = await ports.native.pick(kind);
      if (token !== importEpoch || owner !== editEpoch || !state.draft) return;
      if (!picked) { publish({ busy: 'idle' }); return; }
      const attachment: ReminderAttachment = { ...picked, id: ports.id() };
      const draft = { ...state.draft, [kind]: attachment,
        ...(kind === 'image' ? { imagePreview: attachment } : {}) };
      publish({ draft, dirty: isDirty(draft), busy: 'idle' });
    } catch {
      if (token === importEpoch && owner === editEpoch) publish({ busy: 'idle', error: 'Import failed. Your previous draft media is still here.' });
    }
  }
  async function save() {
    const draft = state.draft;
    if (!draft || state.busy !== 'idle') return false;
    const { card, image, audio } = draft;
    const hasImage = image === null ? false : !!image || !!card.imageId;
    const hasAudio = audio === null ? false : !!audio || !!card.audioId;
    if (!card.label.trim() || (Object.keys(limits) as TextField[]).some(key => card[key].length > limits[key]) ||
        (!card.support.trim() && !hasImage && !hasAudio)) {
      publish({ error: 'Add a label within 40 characters and text, image or audio support within the stated limits.' });
      return false;
    }
    const owner = editEpoch;
    publish({ busy: 'saving', error: null });
    try {
      const saved = await (await repository()).save({ card: { ...card }, image, audio });
      if (owner === editEpoch) { ++editEpoch; original = null; publish({ draft: null, dirty: false, busy: 'idle', error: null,
        active: saved.archived ? state.active : [...state.active.filter(row => row.id !== saved.id), saved].sort((a, b) => a.position - b.position),
        archived: saved.archived ? [...state.archived.filter(row => row.id !== saved.id), saved].sort((a, b) => a.position - b.position) : state.archived }); }
      void refresh();
      return true;
    } catch {
      if (owner === editEpoch) publish({ busy: 'idle', error: 'Not saved. Your edits are still here. Retry Save. If attachments are at the 32 MiB limit, remove or replace saved media.' });
      return false;
    }
  }
  async function move(id: string, direction: 'up' | 'down') {
    try { await (await repository()).move(id, direction); await refresh(); }
    catch { publish({ error: safeError }); }
  }
  async function archive(id: string, archived: boolean) {
    try { await (await repository()).archive(id, archived); await refresh(); }
    catch { publish({ error: archived ? 'Could not archive. Keep at least one active button.' : safeError }); }
  }
  async function selectSupport(card: EmotionCard) {
    const token = ++supportEpoch;
    void stop();
    publish({ selected: card, supportImage: null, error: null });
    if (!card.imageId) return;
    try {
      const value = await (await repository()).attachment(card.imageId);
      if (token === supportEpoch && state.selected?.id === card.id) publish({ supportImage: value,
        error: value ? null : 'Current image could not load. The saved card remains available.' });
    } catch {
      if (token === supportEpoch) publish({ error: 'Current image could not load. The saved card remains available.' });
    }
  }
  function leaveSupport() {
    ++supportEpoch;
    void stop();
    publish({ selected: null, supportImage: null });
  }
  function stop() {
    const token = ++playEpoch;
    if (!pendingNativeStop) {
      const operation = (async () => {
        if (!ports.native) return true;
        try { await ports.native.stop(); return true; }
        catch { return false; }
      })();
      pendingNativeStop = operation;
      void operation.finally(() => { if (pendingNativeStop === operation) pendingNativeStop = null; });
    }
    stopTask = pendingNativeStop.then(released => {
      if (token === playEpoch) publish(released ? { playing: 'idle', durationMs: 0 } :
        { playing: 'cleanup', error: 'Reminder audio release is not confirmed. Press Stop again before other audio.' });
      return released;
    });
    return stopTask;
  }
  async function play() {
    if (!foreground || !ports.native || state.playing !== 'idle') return;
    const card = state.selected;
    const audioId = state.draft ? state.draft.audio === null ? null : state.draft.audio?.id ?? state.draft.card.audioId : card?.audioId;
    if (!audioId) return;
    const token = ++playEpoch;
    publish({ playing: 'loading', error: null });
    try {
      if (!await stopTask) { if (token === playEpoch) publish({ playing: 'cleanup', error: 'Reminder audio release is not confirmed. Press Stop again.' }); return; }
      if (token !== playEpoch || !foreground) return;
      const released = await ports.recording.stopForSessionEnd();
      if (token !== playEpoch || !foreground) return;
      if (!released) { publish({ playing: 'idle', error: 'Stop journal audio before playing this reminder.' }); return; }
      const payload = state.draft?.audio?.id === audioId ? state.draft.audio : await (await repository()).attachment(audioId);
      if (token !== playEpoch || !foreground) return;
      if (!payload || payload.kind !== 'audio') throw Error('Missing audio');
      await ports.native.play(payload.base64);
      if (token !== playEpoch || !foreground) { await stop(); return; }
      publish({ playing: 'playing' });
    } catch {
      if (token !== playEpoch) return;
      // A rejected native start can still own a playback handle or temporary.
      // Only confirmed Stop may restore idle; failed release keeps Stop visible.
      const released = await stop();
      if (released && playEpoch === token + 1) publish({ error: 'Reminder audio could not play. Your saved card is unchanged.' });
    }
  }
  async function poll() {
    if (!ports.native || (state.playing !== 'playing' && state.playing !== 'cleanup')) return;
    const token = playEpoch;
    try {
      const status = await ports.native.status();
      if (token !== playEpoch) return;
      if (status.state === 'idle') publish({ playing: 'idle', durationMs: 0 });
      else publish({ playing: status.state, durationMs: status.durationMs });
    } catch { publish({ playing: 'cleanup', error: 'Reminder audio state is uncertain. Press Stop again.' }); }
  }
  function background() { foreground = false; void stop(); }
  function foregrounded() { foreground = true; void poll(); }
  return { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); } },
    refresh, edit, add, change, removeMedia, importMedia, save, discard, move, archive, selectSupport, leaveSupport,
    play, stop, poll, background, foreground: foregrounded };
}
export type ReminderController = ReturnType<typeof createReminderController>;

export type AppearanceState = { value: Appearance; status: 'loading' | 'loadFailed' | 'saved' | 'saving' | 'failed' | 'unavailable' };
export function createAppearanceController(ports: { repository(): Promise<AppearanceRepository | null> }) {
  let state: AppearanceState = { value: 'system', status: 'loading' };
  const listeners = new Set<() => void>();
  let version = 0;
  let tail: Promise<void> = Promise.resolve();
  function publish(patch: Partial<AppearanceState>) { state = { ...state, ...patch }; listeners.forEach(listener => listener()); }
  async function load() {
    const token = version;
    try {
      const repository = await ports.repository();
      if (!repository) { if (token === version) publish({ status: 'unavailable' }); return; }
      const value = await repository.get();
      if (token === version) publish({ value, status: 'saved' });
    } catch { if (token === version) publish({ status: 'loadFailed' }); }
  }
  async function write(value: Appearance) {
    const token = ++version;
    publish({ value, status: 'saving' });
    const operation = tail.then(async () => {
      const repository = await ports.repository();
      if (!repository) { if (token === version) publish({ status: 'unavailable' }); return; }
      await repository.set(value);
      if (token === version) publish({ status: 'saved' });
    }).catch(() => { if (token === version) publish({ status: 'failed' }); });
    tail = operation;
    await operation;
  }
  return { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); } },
    load, choose: write, retry: () => write(state.value) };
}
export type AppearanceController = ReturnType<typeof createAppearanceController>;

/** Intercepts the real clip panel entry points without creating another clip owner. */
export function createCoordinatedRecordingController<T extends {
  getSnapshot(): { momentId: string | null; phase: string };
  record(): Promise<void>; play(id: string): Promise<void>;
  select(id: string | null): Promise<void>; background(): Promise<void>;
  stop(): Promise<void>; stopForSessionEnd(): Promise<boolean>;
}>(recording: T, reminder: { stop(): Promise<boolean> }): T {
  let epoch = 0;
  async function admit(work: () => Promise<void>) {
    const owner = recording.getSnapshot().momentId;
    const token = epoch;
    if (!owner) return;
    const released = await reminder.stop();
    if (!released || token !== epoch || recording.getSnapshot().momentId !== owner || recording.getSnapshot().phase !== 'ready') return;
    await work();
  }
  return {
    ...recording,
    record: () => admit(() => recording.record()),
    play: (id: string) => admit(() => recording.play(id)),
    select: (id: string | null) => { ++epoch; return recording.select(id); },
    background: () => { ++epoch; return recording.background(); },
    stop: () => { ++epoch; return recording.stop(); },
    stopForSessionEnd: () => { ++epoch; return recording.stopForSessionEnd(); },
  };
}
