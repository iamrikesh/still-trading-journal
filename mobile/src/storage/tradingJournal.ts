import { clipTransaction } from './clipSchema.ts';
import type { JournalDatabase } from './sqlJournal.ts';
import type { Moment } from './types.ts';
import type { TradingCursor, TradingRepository, TradingSession, Writing, WritingOwner } from './tradingTypes.ts';

type WritingRow = Omit<Writing, 'owner'> & { momentId: string | null; sessionId: string | null };
const sessionFields = 'id, title, startedAt, endedAt, originalStartedAt, originalEndedAt, adjustedAt, archivedAt';
const writingFields = 'id, momentId, sessionId, kind, text, createdAt, updatedAt, finalisedAt, revision';
const failure = () => new Error('Trading journal operation failed.');
function id(value: string): void { if (typeof value !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value)) throw failure(); }
// The schema-1 journal accepted arbitrary text moment IDs. References to
// existing moments must retain that domain; new session/writing IDs stay strict.
function momentIdCheck(value: string): void { if (typeof value !== 'string') throw failure(); }
function at(value: string): void { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw failure(); }
function title(value: string): void { if (typeof value !== 'string' || value.length > 120) throw failure(); }
function text(value: string): void { if (typeof value !== 'string' || value.length > 20000) throw failure(); }
function revision(value: number): void { if (!Number.isSafeInteger(value) || value < 0) throw failure(); }
function cursor(value?: TradingCursor, validateId = id): void { if (value) { at(value.at); validateId(value.id); } }
function owner(value: WritingOwner): void {
  if (!value || !['moment', 'session'].includes(value.kind)) throw failure();
  (value.kind === 'moment' ? momentIdCheck : id)(value.id);
}
function writing(row: WritingRow): Writing {
  return { id: row.id, owner: row.momentId ? { kind: 'moment', id: row.momentId } : { kind: 'session', id: row.sessionId! },
    kind: row.kind, text: row.text, createdAt: row.createdAt, updatedAt: row.updatedAt, finalisedAt: row.finalisedAt, revision: row.revision };
}
function validateWriting(value: Writing): void {
  if (!value) throw failure();
  id(value.id); owner(value.owner);
  if (value.kind !== 'note' && value.kind !== 'reflection' || value.kind === 'note' && value.owner.kind !== 'moment') throw failure();
  text(value.text); at(value.createdAt); at(value.updatedAt); if (value.finalisedAt !== null) throw failure(); revision(value.revision);
  if (value.updatedAt < value.createdAt) throw failure();
}

/** Called inside the session's serialized queue. */
export function createTradingRepository(db: JournalDatabase): TradingRepository {
  async function session(idValue: string): Promise<TradingSession | undefined> {
    return (await db.getAllAsync<TradingSession>(`SELECT ${sessionFields} FROM trading_sessions WHERE id = ?`, idValue))[0];
  }
  async function entry(idValue: string): Promise<WritingRow | undefined> {
    return (await db.getAllAsync<WritingRow>(`SELECT ${writingFields} FROM journal_writings WHERE id = ?`, idValue))[0];
  }
  async function liveOwner(value: WritingOwner): Promise<boolean> {
    if (value.kind === 'session') return !!await session(value.id);
    return (await db.getAllAsync<{ id: string }>(`SELECT id FROM moments WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM moment_deletions WHERE moment_deletions.id = moments.id)`, value.id)).length > 0;
  }
  return {
    async active() { return (await db.getAllAsync<TradingSession>(`SELECT ${sessionFields} FROM trading_sessions WHERE endedAt IS NULL`))[0] ?? null; },
    async start(input) {
      id(input.id); title(input.title); at(input.at);
      const existing = await session(input.id);
      if (existing) {
        if (existing.title === input.title && existing.originalStartedAt === input.at) return existing;
        throw failure();
      }
      await db.runAsync(`INSERT INTO trading_sessions(id, title, startedAt, originalStartedAt)
        VALUES (?, ?, ?, ?)`, input.id, input.title, input.at, input.at);
      return (await session(input.id))!;
    },
    async end(idValue, time) {
      id(idValue); at(time);
      const current = await session(idValue);
      if (!current) throw failure();
      if (current.endedAt !== null) return;
      if (time < current.startedAt) throw failure();
      await db.runAsync('UPDATE trading_sessions SET endedAt = ?, originalEndedAt = ? WHERE id = ? AND endedAt IS NULL', time, time, idValue);
    },
    async adjust(idValue, input) {
      id(idValue); title(input.title); at(input.startedAt); at(input.at);
      if (input.endedAt !== null) at(input.endedAt);
      const current = await session(idValue);
      if (!current || (current.endedAt === null) !== (input.endedAt === null) ||
          input.endedAt !== null && input.endedAt < input.startedAt) throw failure();
      await db.runAsync(`UPDATE trading_sessions SET title = ?, startedAt = ?, endedAt = ?, adjustedAt = ? WHERE id = ?`,
        input.title, input.startedAt, input.endedAt, input.at, idValue);
    },
    async archive(idValue, archived, time) {
      id(idValue); at(time); if (typeof archived !== 'boolean') throw failure();
      const current = await session(idValue);
      if (!current || current.endedAt === null) throw failure();
      await db.runAsync('UPDATE trading_sessions SET archivedAt = ? WHERE id = ?', archived ? time : null, idValue);
    },
    async sessions(archived, before) {
      if (typeof archived !== 'boolean') throw failure(); cursor(before);
      return db.getAllAsync<TradingSession>(`SELECT ${sessionFields} FROM trading_sessions WHERE archivedAt IS ${archived ? 'NOT NULL' : 'NULL'}
        ${before ? 'AND (startedAt < ? OR (startedAt = ? AND id < ?))' : ''}
        ORDER BY startedAt DESC, id DESC LIMIT 30`, ...(before ? [before.at, before.at, before.id] : []));
    },
    async assign(momentId, sessionId) {
      momentIdCheck(momentId); if (sessionId !== null) id(sessionId);
      await clipTransaction(db, async () => {
        if (!await liveOwner({ kind: 'moment', id: momentId }) || sessionId !== null && !await session(sessionId)) throw failure();
        if (sessionId === null) await db.runAsync('DELETE FROM trading_memberships WHERE momentId = ?', momentId);
        else await db.runAsync(`INSERT INTO trading_memberships(momentId, sessionId) VALUES (?, ?)
          ON CONFLICT(momentId) DO UPDATE SET sessionId = excluded.sessionId`, momentId, sessionId);
      });
    },
    async membership(momentId) {
      momentIdCheck(momentId);
      return (await db.getAllAsync<TradingSession>(`SELECT ${sessionFields} FROM trading_sessions
        JOIN trading_memberships ON trading_memberships.sessionId = trading_sessions.id
        WHERE trading_memberships.momentId = ? AND NOT EXISTS
        (SELECT 1 FROM moment_deletions WHERE moment_deletions.id = trading_memberships.momentId)`, momentId))[0] ?? null;
    },
    async timeline(sessionId, before) {
      id(sessionId); cursor(before, momentIdCheck);
      if (!await session(sessionId)) throw failure();
      return db.getAllAsync<Moment>(`SELECT moments.id, emotionId, emotionLabel, createdAt, supportText FROM moments
        JOIN trading_memberships ON trading_memberships.momentId = moments.id
        WHERE trading_memberships.sessionId = ? AND NOT EXISTS
        (SELECT 1 FROM moment_deletions WHERE moment_deletions.id = moments.id)
        ${before ? 'AND (createdAt < ? OR (createdAt = ? AND moments.id < ?))' : ''}
        ORDER BY createdAt DESC, moments.id DESC LIMIT 30`, sessionId, ...(before ? [before.at, before.at, before.id] : []));
    },
    async writings(value, before) {
      owner(value); cursor(before);
      if (!await liveOwner(value)) return [];
      const column = value.kind === 'moment' ? 'momentId' : 'sessionId';
      const rows = await db.getAllAsync<WritingRow>(`SELECT ${writingFields} FROM journal_writings WHERE ${column} = ?
        ${before ? 'AND (COALESCE(finalisedAt, updatedAt) < ? OR (COALESCE(finalisedAt, updatedAt) = ? AND id < ?))' : ''}
        ORDER BY COALESCE(finalisedAt, updatedAt) DESC, id DESC LIMIT 30`, value.id, ...(before ? [before.at, before.at, before.id] : []));
      return rows.map(writing);
    },
    async saveDraft(input) {
      validateWriting(input);
      return clipTransactionResult(db, async () => {
        const current = await entry(input.id);
        if (!await liveOwner(input.owner)) throw failure();
        if (current) {
          if (current.momentId !== (input.owner.kind === 'moment' ? input.owner.id : null) ||
              current.sessionId !== (input.owner.kind === 'session' ? input.owner.id : null) ||
              current.kind !== input.kind || current.createdAt !== input.createdAt || current.finalisedAt !== null) throw failure();
          if (input.revision < current.revision || input.updatedAt < current.updatedAt) throw failure();
          if (input.revision === current.revision) {
            if (input.text !== current.text || input.updatedAt !== current.updatedAt) throw failure();
            return writing(current);
          }
          await db.runAsync('UPDATE journal_writings SET text = ?, updatedAt = ?, revision = ? WHERE id = ? AND finalisedAt IS NULL',
            input.text, input.updatedAt, String(input.revision), input.id);
        } else {
          await db.runAsync(`INSERT INTO journal_writings(id, momentId, sessionId, kind, text, createdAt, updatedAt, revision)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, input.id,
            input.owner.kind === 'moment' ? input.owner.id : null,
            input.owner.kind === 'session' ? input.owner.id : null,
            input.kind, input.text, input.createdAt, input.updatedAt, String(input.revision));
        }
        return writing((await entry(input.id))!);
      });
    },
    async finalise(idValue, value, nextRevision, time) {
      id(idValue); text(value); revision(nextRevision); at(time);
      if (!value.trim()) throw failure();
      return clipTransactionResult(db, async () => {
        const current = await entry(idValue);
        if (!current || !await liveOwner(current.momentId ? { kind: 'moment', id: current.momentId } : { kind: 'session', id: current.sessionId! })) throw failure();
        if (current.finalisedAt !== null) {
          if (current.text === value && current.revision === nextRevision && current.finalisedAt === time) return writing(current);
          throw failure();
        }
        if (nextRevision < current.revision || nextRevision === current.revision && value !== current.text || time < current.updatedAt) throw failure();
        await db.runAsync(`UPDATE journal_writings SET text = ?, updatedAt = ?, finalisedAt = ?, revision = ?
          WHERE id = ? AND finalisedAt IS NULL`, value, time, time, String(nextRevision), idValue);
        return writing((await entry(idValue))!);
      });
    },
    async discardDraft(idValue) {
      id(idValue);
      const current = await entry(idValue);
      if (current && !await liveOwner(current.momentId ? { kind: 'moment', id: current.momentId } : { kind: 'session', id: current.sessionId! })) throw failure();
      await db.runAsync('DELETE FROM journal_writings WHERE id = ? AND finalisedAt IS NULL', idValue);
    },
  };
}

async function clipTransactionResult<T>(db: JournalDatabase, work: () => Promise<T>): Promise<T> {
  let result!: T;
  await clipTransaction(db, async () => { result = await work(); });
  return result;
}
