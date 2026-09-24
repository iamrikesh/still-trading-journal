import { validateImportedReminder } from '../reminders/nativeReminders.ts';
import { clipTransaction } from './clipSchema.ts';
import type { JournalDatabase } from './sqlJournal.ts';
import type { Appearance, AppearanceRepository, EmotionCard, ReminderAttachment, ReminderRepository, ReminderSave } from './reminderTypes.ts';

type CardRow = Omit<EmotionCard, 'archived'> & { archived: number };
const fields = 'id, label, hint, symbol, support, action, position, archived, revision, imageId, audioId';
const invalid = () => new Error('Reminder change unavailable. Your saved card has not changed.');
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value);
const same = (a: ReminderAttachment, b: ReminderAttachment) =>
  a.id === b.id && a.kind === b.kind && a.mime === b.mime && a.bytes === b.bytes &&
  a.base64 === b.base64 && a.width === b.width && a.height === b.height && a.durationMs === b.durationMs;

function card(row: CardRow): EmotionCard { return { ...row, archived: row.archived === 1 }; }
function validateCard(value: EmotionCard): void {
  if (!value || !validId(value.id) || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 40 ||
      typeof value.hint !== 'string' || value.hint.length > 120 || typeof value.symbol !== 'string' || value.symbol.length > 8 ||
      typeof value.support !== 'string' || value.support.length > 4000 || typeof value.action !== 'string' || value.action.length > 500 ||
      !Number.isSafeInteger(value.position) || value.position < 0 || typeof value.archived !== 'boolean' ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      (value.imageId !== null && !validId(value.imageId)) || (value.audioId !== null && !validId(value.audioId))) throw invalid();
}
function validatedAttachment(value: ReminderAttachment | null | undefined, kind: 'image' | 'audio') {
  if (value === undefined || value === null) return value;
  if (!validId(value.id)) throw invalid();
  return { id: value.id, ...validateImportedReminder(value, kind) };
}

export function createReminderRepository(db: JournalDatabase): ReminderRepository {
  const readCard = async (id: string) => {
    const [row] = await db.getAllAsync<CardRow>(`SELECT ${fields} FROM emotion_cards WHERE id = ?`, id);
    return row && card(row);
  };
  const readAttachment = async (id: string): Promise<ReminderAttachment | null> => {
    const [row] = await db.getAllAsync<ReminderAttachment>(
      'SELECT id, kind, mime, bytes, base64, width, height, durationMs FROM reminder_payloads WHERE id = ?', id);
    return row ?? null;
  };
  const matchesStored = async (candidate: ReminderAttachment) => {
    const prior = await readAttachment(candidate.id);
    return prior !== null && same(prior, candidate);
  };
  async function storeAttachment(candidate: ReminderAttachment, oldId: string | null): Promise<void> {
    const prior = await readAttachment(candidate.id);
    if (prior) {
      if (candidate.id !== oldId || !same(prior, candidate)) throw invalid();
      return;
    }
    await db.runAsync(`INSERT INTO reminder_payloads(id,kind,mime,bytes,base64,width,height,durationMs)
      VALUES (?,?,?,?,?,?,?,?)`, candidate.id, candidate.kind, candidate.mime, String(candidate.bytes), candidate.base64,
      candidate.width === null ? null : String(candidate.width), candidate.height === null ? null : String(candidate.height),
      candidate.durationMs === null ? null : String(candidate.durationMs));
  }
  async function removeUnused(id: string | null): Promise<void> {
    if (id === null) return;
    await db.runAsync(`DELETE FROM reminder_payloads WHERE id = ? AND NOT EXISTS
      (SELECT 1 FROM emotion_cards WHERE imageId = ? OR audioId = ?)`, id, id, id);
  }
  return {
    list: async (archived = false) => {
      if (typeof archived !== 'boolean') throw invalid();
      const rows = await db.getAllAsync<CardRow>(`SELECT ${fields}
        FROM emotion_cards WHERE archived = ? ORDER BY position, id`, archived ? '1' : '0');
      return rows.map(card);
    },
    async save(input: ReminderSave) {
      validateCard(input.card);
      const image = validatedAttachment(input.image, 'image');
      const audio = validatedAttachment(input.audio, 'audio');
      const requested = input.card;
      let saved: EmotionCard | undefined;
      await clipTransaction(db, async () => {
        const old = await readCard(requested.id);
        if (old && requested.archived !== old.archived) throw invalid();
        if (!old && (requested.revision !== 0 || requested.imageId !== null && image === undefined ||
            requested.audioId !== null && audio === undefined)) throw invalid();
        if (old && ((image === undefined && requested.imageId !== old.imageId) ||
                    (audio === undefined && requested.audioId !== old.audioId))) throw invalid();
        const imageId = image === undefined ? old?.imageId ?? null : image?.id ?? null;
        const audioId = audio === undefined ? old?.audioId ?? null : audio?.id ?? null;
        if (!requested.support.trim() && imageId === null && audioId === null) throw invalid();
        if (imageId !== null && imageId === audioId) throw invalid();
        const identical = old && old.label === requested.label && old.hint === requested.hint &&
          old.symbol === requested.symbol && old.support === requested.support && old.action === requested.action &&
          old.imageId === imageId && old.audioId === audioId &&
          (!image || await matchesStored(image)) && (!audio || await matchesStored(audio));
        if (old && identical && (requested.revision === old.revision || requested.revision + 1 === old.revision)) {
          saved = old;
          return;
        }
        if (old && requested.revision !== old.revision) throw invalid();
        if (old) {
          if (image && image.id === old.audioId || audio && audio.id === old.imageId) throw invalid();
        } else {
          const [count] = await db.getAllAsync<{ n: number }>('SELECT count(*) AS n FROM emotion_cards');
          if (!count || count.n >= 40) throw invalid();
        }
        if (image) await storeAttachment(image, old?.imageId ?? null);
        if (audio) await storeAttachment(audio, old?.audioId ?? null);
        if (old) {
          await db.runAsync(`UPDATE emotion_cards SET label=?,hint=?,symbol=?,support=?,action=?,revision=?,imageId=?,audioId=? WHERE id=?`,
            requested.label, requested.hint, requested.symbol, requested.support, requested.action,
            String(old.revision + 1), imageId, audioId, requested.id);
          if (old.imageId !== imageId) await removeUnused(old.imageId);
          if (old.audioId !== audioId) await removeUnused(old.audioId);
        } else {
          const [last] = await db.getAllAsync<{ n: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM emotion_cards');
          await db.runAsync(`INSERT INTO emotion_cards(${fields}) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            requested.id, requested.label, requested.hint, requested.symbol, requested.support, requested.action,
            String(last!.n), requested.archived ? '1' : '0', '0', imageId, audioId);
        }
        const [usage] = await db.getAllAsync<{ n: number }>('SELECT COALESCE(SUM(bytes),0) AS n FROM reminder_payloads');
        if (!usage || !Number.isSafeInteger(usage.n) || usage.n > 33554432) throw invalid();
        saved = await readCard(requested.id);
      });
      if (!saved) throw invalid();
      return saved;
    },
    async move(id, direction) {
      if (!validId(id) || direction !== 'up' && direction !== 'down') throw invalid();
      await clipTransaction(db, async () => {
        const current = await readCard(id);
        if (!current) throw invalid();
        const rows = await db.getAllAsync<CardRow>(`SELECT ${fields} FROM emotion_cards WHERE archived = ? ORDER BY position, id`, current.archived ? '1' : '0');
        const index = rows.findIndex(row => row.id === id);
        const adjacent = rows[index + (direction === 'up' ? -1 : 1)];
        if (!adjacent) return;
        await db.runAsync('UPDATE emotion_cards SET position = ?, revision = revision + 1 WHERE id = ?', String(adjacent.position), current.id);
        await db.runAsync('UPDATE emotion_cards SET position = ?, revision = revision + 1 WHERE id = ?', String(current.position), adjacent.id);
      });
    },
    async archive(id, archived) {
      if (!validId(id) || typeof archived !== 'boolean') throw invalid();
      await clipTransaction(db, async () => {
        const current = await readCard(id);
        if (!current) throw invalid();
        if (current.archived === archived) return;
        if (archived) {
          const [count] = await db.getAllAsync<{ n: number }>('SELECT count(*) AS n FROM emotion_cards WHERE archived = 0');
          if (!count || count.n < 2) throw invalid();
        }
        await db.runAsync('UPDATE emotion_cards SET archived = ?, revision = revision + 1 WHERE id = ?', archived ? '1' : '0', id);
      });
    },
    attachment: async id => {
      if (!validId(id)) throw invalid();
      return readAttachment(id);
    },
    usage: async () => {
      const [row] = await db.getAllAsync<{ n: number }>('SELECT COALESCE(SUM(bytes),0) AS n FROM reminder_payloads');
      if (!row || !Number.isSafeInteger(row.n) || row.n < 0) throw invalid();
      return row.n;
    },
  };
}

export function createAppearanceRepository(db: JournalDatabase): AppearanceRepository {
  return {
    async get() {
      const [row] = await db.getAllAsync<{ value: Appearance }>('SELECT value FROM appearance_preference WHERE singleton = 1');
      if (!row || !['system', 'light', 'dark'].includes(row.value)) throw invalid();
      return row.value;
    },
    async set(value) {
      if (value !== 'system' && value !== 'light' && value !== 'dark') throw invalid();
      await db.runAsync('UPDATE appearance_preference SET value = ? WHERE singleton = 1', value);
      const [row] = await db.getAllAsync<{ value: Appearance }>('SELECT value FROM appearance_preference WHERE singleton = 1');
      if (!row || row.value !== value) throw invalid();
    },
  };
}
