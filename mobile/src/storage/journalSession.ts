import { createClipJournal } from './clipJournal.ts';
import { requireUsableClipDatabase } from './clipSchema.ts';
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
    if (!version || ![0, 1, 2].includes(version.user_version)) throw failure();
    if (!vault && version.user_version === 2) throw failure();
    let legacy: JournalRepository | undefined;
    if (version.user_version < 2) legacy = await createSqlJournal(db);
    let tail: Promise<unknown> = Promise.resolve();
    function enqueue<T>(work: () => Promise<T>): Promise<T> {
      const result = tail.then(() => { requireUsableClipDatabase(db); return work(); }).catch(() => { throw failure(); });
      tail = result.catch(() => undefined);
      return result;
    }
    function wrap(journal: JournalRepository): JournalRepository {
      return {
        save: moment => { const snapshot = { ...moment }; return enqueue(() => journal.save(snapshot)); },
        list: () => enqueue(() => journal.list()), remove: id => enqueue(() => journal.remove(id)),
      };
    }
    if (!vault) return { journal: wrap(legacy!), clips: null, exercise: null, recovery: () => enqueue(async () => ({ pending: 0 })) };
    let evidence = false;
    if (version.user_version === 2) {
      const [row] = await db.getAllAsync<{ count: number }>(`SELECT
        (SELECT count(*) FROM clips) + (SELECT count(*) FROM moment_deletions) +
        (SELECT count(*) FROM clip_tombstones) + (SELECT count(*) FROM moment_tombstones) AS count`);
      if (!row || !Number.isSafeInteger(row.count) || row.count < 0) throw failure();
      evidence = row.count > 0;
    }
    await vault.initialize(!evidence);
    const core = await createClipJournal(db, vault);
    await core.recover();
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
      journal: wrap(core.journal),
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
