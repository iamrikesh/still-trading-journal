import { createClipJournal } from './clipJournal.ts';
import { clipTransaction, requireUsableClipDatabase } from './clipSchema.ts';
import { migrateTradingSchema } from './tradingSchema.ts';
import { createTradingRepository } from './tradingJournal.ts';
import { migrateReminderSchema } from './reminderSchema.ts';
import { createAppearanceRepository, createReminderRepository } from './reminderJournal.ts';
import type { AppearanceRepository, ReminderRepository } from './reminderTypes.ts';
import type { TradingRepository } from './tradingTypes.ts';
import type { ClipJournal } from './clipTypes.ts';
import type { NativeClipVault } from './nativeClipVault.ts';
import { createSqlJournal, type JournalDatabase } from './sqlJournal.ts';
import type { JournalRepository, Moment } from './types.ts';
import { createSessionExercise, type ExerciseOperations } from '../development/sessionExercise.ts';
import type { AudioStatus, NativeAudio } from '../recording/nativeAudio.ts';
import type { ClipIntent } from './clipTypes.ts';

export type SessionOptions = { debug: boolean; id(): string; now(): string; audio?: NativeAudio | null };
export interface SessionAudio {
  start(intent: ClipIntent): Promise<void>;
  stop(id: string): Promise<void>;
  releaseCapture(id: string): Promise<void>;
  play(id: string): Promise<void>;
  stopPlayback(): Promise<void>;
  status(): Promise<AudioStatus>;
  usage(): Promise<number>;
  pendingOwners(): Promise<Moment[]>;
}
export interface JournalSession {
  journal: JournalRepository;
  clips: Omit<ClipJournal, 'journal'> | null;
  exercise: ExerciseOperations | null;
  recovery(): Promise<{ pending: number }>;
  audio?: SessionAudio | null;
  trading?: TradingRepository;
  reminders?: ReminderRepository;
  appearance?: AppearanceRepository;
}
const failure = () => new Error('Journal session unavailable. Existing data has not been reset.');

/** Kept in globalThis by the native entry point, including across Fast Refresh.
 * Failed opens are retryable; successful owners live until the JS runtime ends. */
export function runtimeSession<T>(host: object, factory: () => Promise<T>): () => Promise<T> {
  const slots = host as { __stillJournalSessionV2?: { pending?: Promise<T> } };
  const slot = slots.__stillJournalSessionV2 ??= {};
  return () => {
    slot.pending ??= Promise.resolve().then(factory).catch(() => { slot.pending = undefined; throw failure(); });
    return slot.pending;
  };
}

/** Owns every operation, including multi-step debug compositions. The underlying
 * connection and coordinator never escape to screens. */
export async function createJournalSession(db: JournalDatabase, vault: NativeClipVault | null, options: SessionOptions): Promise<JournalSession> {
  try {
    const [version] = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version');
    if (!version || ![0, 1, 2, 3, 4].includes(version.user_version)) throw failure();
    if (!vault && version.user_version >= 2) throw failure();
    let legacy: JournalRepository | undefined;
    if (version.user_version < 2) legacy = await createSqlJournal(db);
    let tail: Promise<unknown> = Promise.resolve();
    function enqueue<T>(work: () => Promise<T>): Promise<T> {
      const result = tail.then(() => { requireUsableClipDatabase(db); return work(); }).catch(() => { throw failure(); });
      tail = result.catch(() => undefined);
      return result;
    }
    function wrap(journal: JournalRepository, autoAssociate = false): JournalRepository {
      return {
        save: moment => { const snapshot = { ...moment }; return enqueue(async () => {
          if (!autoAssociate) return journal.save(snapshot);
          await clipTransaction(db, async () => {
            const existing = await db.getAllAsync<{ id: string }>('SELECT id FROM moments WHERE id = ?', snapshot.id);
            await journal.save(snapshot);
            if (!existing.length) await db.runAsync(`INSERT INTO trading_memberships(momentId, sessionId)
              SELECT ?, id FROM trading_sessions WHERE endedAt IS NULL`, snapshot.id);
          });
        }); },
        list: before => { const cursor = before && { ...before }; return enqueue(() => journal.list(cursor)); },
        remove: id => enqueue(() => journal.remove(id)),
      };
    }
    if (!vault) return { journal: wrap(legacy!), clips: null, exercise: null, recovery: () => enqueue(async () => ({ pending: 0 })) };
    let evidence = false;
    if (version.user_version >= 2) {
      const [row] = await db.getAllAsync<{ count: number }>(`SELECT
        (SELECT count(*) FROM clips) + (SELECT count(*) FROM moment_deletions) +
        (SELECT count(*) FROM clip_tombstones) + (SELECT count(*) FROM moment_tombstones) AS count`);
      if (!row || !Number.isSafeInteger(row.count) || row.count < 0) throw failure();
      evidence = row.count > 0;
    }
    await vault.initialize(!evidence);
    const core = await createClipJournal(db, vault);
    await core.recover();
    await migrateTradingSchema(db);
    await migrateReminderSchema(db);
    const tradingCore = createTradingRepository(db);
    const reminderCore = createReminderRepository(db);
    const appearanceCore = createAppearanceRepository(db);
    const reminders: ReminderRepository = {
      list: archived => enqueue(() => reminderCore.list(archived)),
      save: input => {
        const snapshot = {
          card: { ...input.card },
          image: input.image && { ...input.image },
          audio: input.audio && { ...input.audio },
        };
        return enqueue(() => reminderCore.save(snapshot));
      },
      move: (id, direction) => enqueue(() => reminderCore.move(id, direction)),
      archive: (id, archived) => enqueue(() => reminderCore.archive(id, archived)),
      attachment: id => enqueue(() => reminderCore.attachment(id)),
      usage: () => enqueue(() => reminderCore.usage()),
    };
    const appearance: AppearanceRepository = {
      get: () => enqueue(() => appearanceCore.get()),
      set: value => enqueue(() => appearanceCore.set(value)),
    };
    const trading: TradingRepository = {
      active: () => enqueue(() => tradingCore.active()),
      start: input => { const snapshot = { ...input }; return enqueue(() => tradingCore.start(snapshot)); },
      end: (id, at) => enqueue(() => tradingCore.end(id, at)),
      adjust: (id, input) => { const snapshot = { ...input }; return enqueue(() => tradingCore.adjust(id, snapshot)); },
      archive: (id, archived, at) => enqueue(() => tradingCore.archive(id, archived, at)),
      sessions: (archived, before) => { const cursor = before && { ...before }; return enqueue(() => tradingCore.sessions(archived, cursor)); },
      assign: (momentId, sessionId) => enqueue(() => tradingCore.assign(momentId, sessionId)),
      membership: momentId => enqueue(() => tradingCore.membership(momentId)),
      timeline: (sessionId, before) => { const cursor = before && { ...before }; return enqueue(() => tradingCore.timeline(sessionId, cursor)); },
      writings: (owner, before) => { const owned = { ...owner }; const cursor = before && { ...before }; return enqueue(() => tradingCore.writings(owned, cursor)); },
      saveDraft: input => { const snapshot = { ...input, owner: { ...input.owner } }; return enqueue(() => tradingCore.saveDraft(snapshot)); },
      finalise: (id, text, revision, at) => enqueue(() => tradingCore.finalise(id, text, revision, at)),
      discardDraft: id => enqueue(() => tradingCore.discardDraft(id)),
    };
    const pending = async (exceptOwner?: string) => {
      const [row] = await db.getAllAsync<{ count: number }>(`SELECT
        (SELECT count(*) FROM moment_deletions) + (SELECT count(*) FROM clips WHERE status <> 'saved'
        ${exceptOwner === undefined ? '' : 'AND momentId <> ?'}) AS count`, ...(exceptOwner === undefined ? [] : [exceptOwner]));
      if (!row || !Number.isSafeInteger(row.count) || row.count < 0) throw failure();
      return row.count;
    };
    const exercise = options.debug ? await createSessionExercise(db, core, vault, options, pending) : null;
    const audio = options.audio;
    return {
      journal: wrap(core.journal, true),
      trading,
      reminders,
      appearance,
      clips: {
        begin: intent => { const snapshot = { ...intent }; return enqueue(async () => { if (await pending()) throw failure(); await core.begin(snapshot); }); },
        finish: id => enqueue(() => core.finish(id)),
        list: (id, before) => { const cursor = before && { ...before }; return enqueue(() => core.list(id, cursor)); },
        remove: id => enqueue(() => core.remove(id)), recover: () => enqueue(() => core.recover()),
      },
      exercise: exercise && { prepare: () => enqueue(exercise.prepare), check: () => enqueue(exercise.check), remove: () => enqueue(exercise.remove) },
      recovery: () => enqueue(async () => ({ pending: await pending() })),
      audio: audio ? {
        start: intent => {
          const snapshot = { ...intent };
          return enqueue(async () => {
            if (await pending()) throw failure();
            await core.begin(snapshot);
            await audio.startCapture(snapshot);
          });
        },
        stop: id => enqueue(async () => { await audio.stopCapture(id); await core.finish(id); }),
        releaseCapture: id => enqueue(() => audio.stopCapture(id)),
        play: id => enqueue(async () => {
          const [row] = await db.getAllAsync<ClipIntent>(`SELECT id, momentId, createdAt FROM clips
            WHERE id = ? AND status = 'saved' AND NOT EXISTS
            (SELECT 1 FROM moment_deletions WHERE moment_deletions.id = clips.momentId)`, id);
          if (!row) throw failure();
          await audio.startPlayback({ id: row.id, momentId: row.momentId, createdAt: row.createdAt });
        }),
        stopPlayback: () => enqueue(() => audio.stopPlayback()),
        status: () => enqueue(() => audio.status()),
        usage: () => enqueue(() => audio.usage()),
        pendingOwners: () => enqueue(() => db.getAllAsync<Moment>(`SELECT id, emotionId, emotionLabel, createdAt, supportText FROM moments
          WHERE EXISTS (SELECT 1 FROM clips WHERE clips.momentId = moments.id AND clips.status <> 'saved')
          OR EXISTS (SELECT 1 FROM moment_deletions WHERE moment_deletions.id = moments.id)
          ORDER BY createdAt, id LIMIT 20`)),
      } : null,
    };
  } catch { throw failure(); }
}
