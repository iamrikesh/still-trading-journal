import type { JournalDatabase } from '../storage/sqlJournal.ts';
import type { Clip, ClipIntent, ClipJournal } from '../storage/clipTypes.ts';
import type { NativeClipVault } from '../storage/nativeClipVault.ts';
import type { Moment } from '../storage/types.ts';
import type { SessionOptions } from '../storage/journalSession.ts';

export type ExerciseResult = { status: 'empty' | 'incomplete' | 'restart' | 'recovered' | 'deleted'; saved: number; pending: number };
export interface ExerciseOperations { prepare(): Promise<ExerciseResult>; check(): Promise<ExerciseResult>; remove(): Promise<ExerciseResult> }
type Marker = { momentId: string; createdAt: string };
const failure = () => new Error('Clip recovery exercise unavailable.');
const sample = { emotionId: 'learning-clip-recovery', emotionLabel: 'Clip recovery exercise', supportText: 'Generated clips for the recovery lesson.' };
function validate(marker: Marker): Marker {
  if (!marker || typeof marker.momentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(marker.momentId) ||
      typeof marker.createdAt !== 'string' || !Number.isFinite(Date.parse(marker.createdAt)) || new Date(marker.createdAt).toISOString() !== marker.createdAt) throw failure();
  return marker;
}
function intents(marker: Marker): ClipIntent[] {
  return ['a', 'b'].map(suffix => ({ id: `clip-${marker.momentId}-${suffix}`, momentId: marker.momentId, createdAt: marker.createdAt }));
}

/** Internal only: caller must hold the session queue for the whole operation. */
export async function createSessionExercise(db: JournalDatabase, core: ClipJournal, vault: NativeClipVault, options: SessionOptions, pending: (exceptOwner?: string) => Promise<number>): Promise<ExerciseOperations> {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS development_clip_exercise (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1), momentId TEXT NOT NULL, createdAt TEXT NOT NULL
  )`);
  async function marker() {
    const rows = await db.getAllAsync<Marker>('SELECT momentId, createdAt FROM development_clip_exercise');
    if (rows.length > 1) throw failure();
    return rows[0] && validate(rows[0]);
  }
  async function inspectOwner(m: Marker) {
    const [owner] = await db.getAllAsync<Moment>('SELECT id, emotionId, emotionLabel, supportText, createdAt FROM moments WHERE id = ?', m.momentId);
    if (owner && (owner.id !== m.momentId || owner.createdAt !== m.createdAt || owner.emotionId !== sample.emotionId ||
        owner.emotionLabel !== sample.emotionLabel || owner.supportText !== sample.supportText)) throw failure();
    const dead = (await db.getAllAsync<{ id: string }>('SELECT id FROM moment_tombstones WHERE id = ?', m.momentId)).length > 0;
    if (owner && dead) throw failure();
    return { owner, dead };
  }
  async function rows(m: Marker) {
    const clips = await db.getAllAsync<Clip>("SELECT id, momentId, createdAt, status, bytes, durationMs FROM clips WHERE momentId = ?", m.momentId);
    const expected = intents(m);
    if (clips.length > 2 || clips.some(row => !expected.some(i => row.id === i.id && row.momentId === i.momentId && row.createdAt === i.createdAt))) throw failure();
    return clips;
  }
  async function check(): Promise<ExerciseResult> {
    const m = await marker();
    if (!m) return { status: 'empty', saved: 0, pending: 0 };
    const { owner, dead } = await inspectOwner(m);
    const clips = await rows(m);
    if (!owner && dead) {
      if (clips.length) throw failure();
      for (const i of intents(m)) if (Object.values(await vault.inspect(i.id)).some(Boolean)) throw failure();
      return { status: 'deleted', saved: 0, pending: 0 };
    }
    if (!owner) {
      if (clips.length) throw failure();
      return { status: 'incomplete', saved: 0, pending: 0 };
    }
    const saved = clips.filter(c => c.status === 'saved').length;
    if (saved === 2) {
      for (const row of clips) {
        const file = await vault.verify(row);
        if (file.bytes !== row.bytes || file.durationMs !== row.durationMs) throw failure();
        const files = await vault.inspect(row.id);
        if (!files.final || files.staging || files.pending || files.verification) throw failure();
      }
      return { status: 'recovered', saved: 2, pending: 0 };
    }
    return { status: saved === 1 && clips.length === 2 ? 'restart' : 'incomplete', saved, pending: clips.length - saved };
  }
  return {
    check,
    async prepare() {
      let m = await marker();
      if (m) {
        const { dead } = await inspectOwner(m);
        if (dead) { if ((await check()).status !== 'deleted') throw failure(); m = undefined; }
      }
      // Only this marker's interrupted preparation may retry. Unrelated pending
      // work must be resolved before beginning more file work.
      if (await pending(m?.momentId)) throw failure();
      if (!m) {
        m = validate({ momentId: options.id(), createdAt: options.now() });
        const collision = await db.getAllAsync<{ id: string }>(`SELECT id FROM moments WHERE id = ? UNION ALL
          SELECT id FROM moment_tombstones WHERE id = ?`, m.momentId, m.momentId);
        if (collision.length) throw failure();
        // Durable marker comes first; a failed save can retry these exact IDs.
        await db.runAsync(`INSERT INTO development_clip_exercise(singleton, momentId, createdAt) VALUES (1, ?, ?)
          ON CONFLICT(singleton) DO UPDATE SET momentId = excluded.momentId, createdAt = excluded.createdAt`, m.momentId, m.createdAt);
      }
      await inspectOwner(m);
      await core.journal.save({ id: m.momentId, createdAt: m.createdAt, ...sample });
      await rows(m);
      for (const [index, i] of intents(m).entries()) {
        await core.begin(i);
        const row = (await rows(m)).find(c => c.id === i.id)!;
        if (row.status === 'saved') continue;
        const files = await vault.inspect(i.id);
        if (!files.final && !files.staging && !files.pending) await vault.prepareFixture(i);
        if (index === 0) await core.finish(i.id);
        else await vault.seal(i); // Deliberately leave the durable intent pending.
      }
      return check();
    },
    async remove() {
      const m = await marker(); if (!m) throw failure();
      const { owner, dead } = await inspectOwner(m);
      if (!owner && !dead) throw failure();
      await rows(m);
      if (owner) await core.journal.remove(m.momentId);
      return check();
    },
  };
}
