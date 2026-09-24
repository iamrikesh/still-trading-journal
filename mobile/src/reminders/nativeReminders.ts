export type ImportedReminder = {
  kind: 'image' | 'audio'; mime: string; bytes: number; base64: string;
  width: number | null; height: number | null; durationMs: number | null;
};

export interface NativeReminders {
  pick(kind: 'image' | 'audio'): Promise<ImportedReminder | null>;
  play(base64: string): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<{ state: 'idle' | 'playing' | 'cleanup'; durationMs: number }>;
}

type Bridge = {
  pickReminder(kind: 'image' | 'audio'): Promise<unknown>;
  playReminder(base64: string): Promise<void>;
  stopReminder(): Promise<void>;
  reminderStatus(): Promise<unknown>;
};

const MAX_IMAGE_BYTES = 2097152;
const MAX_AUDIO_BYTES = 4194304;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function invalid(): Error { return new Error('Reminder media unavailable or invalid. Your saved card has not changed.'); }

function canonicalBytes(value: unknown, cap: number): number {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4 * Math.ceil(cap / 3) ||
      value.length % 4 !== 0) throw invalid();
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  for (let index = 0; index < value.length - padding; index++) {
    if (ALPHABET.indexOf(value.charAt(index)) < 0) throw invalid();
  }
  for (let index = value.length - padding; index < value.length; index++) {
    if (value.charAt(index) !== '=') throw invalid();
  }
  const bytes = value.length / 4 * 3 - padding;
  if (bytes < 1 || bytes > cap) throw invalid();
  if (padding === 2 && (ALPHABET.indexOf(value.charAt(value.length - 3)) & 15) !== 0) throw invalid();
  if (padding === 1 && (ALPHABET.indexOf(value.charAt(value.length - 2)) & 3) !== 0) throw invalid();
  return bytes;
}

export function validateImportedReminder(value: unknown, kind: 'image' | 'audio'): ImportedReminder {
  if (!value || typeof value !== 'object') throw invalid();
  const item = value as Record<string, unknown>;
  if (item.kind !== kind || typeof item.mime !== 'string' ||
      !Number.isSafeInteger(item.bytes) || item.bytes !== canonicalBytes(item.base64, kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES)) throw invalid();
  if (kind === 'image') {
    if (!['image/png', 'image/jpeg'].includes(item.mime) || item.durationMs !== null ||
        !Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height) ||
        (item.width as number) < 1 || (item.height as number) < 1 ||
        (item.width as number) > 4096 || (item.height as number) > 4096 ||
        (item.width as number) * (item.height as number) > 4000000) throw invalid();
  } else if (!['audio/wav', 'audio/mpeg', 'audio/mp4'].includes(item.mime) ||
      item.width !== null || item.height !== null || !Number.isSafeInteger(item.durationMs) ||
      (item.durationMs as number) < 1 || (item.durationMs as number) > 240000) throw invalid();
  return {
    kind, mime: item.mime, bytes: item.bytes as number, base64: item.base64 as string,
    width: item.width as number | null, height: item.height as number | null,
    durationMs: item.durationMs as number | null,
  };
}

export function createNativeReminders(value: unknown): NativeReminders | null {
  if (!value || typeof value !== 'object') return null;
  const native = value as Bridge;
  if (['pickReminder', 'playReminder', 'stopReminder', 'reminderStatus'].some(
    name => typeof native[name as keyof Bridge] !== 'function')) return null;
  async function safe<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch { throw invalid(); }
  }
  return {
    pick: kind => safe(async () => {
      if (kind !== 'image' && kind !== 'audio') throw invalid();
      const result = await native.pickReminder(kind);
      return result === null ? null : validateImportedReminder(result, kind);
    }),
    play: base64 => safe(async () => { canonicalBytes(base64, MAX_AUDIO_BYTES); await native.playReminder(base64); }),
    stop: () => safe(() => native.stopReminder()),
    status: () => safe(async () => {
      const value = await native.reminderStatus();
      if (!value || typeof value !== 'object') throw invalid();
      const status = value as Record<string, unknown>;
      if (!['idle', 'playing', 'cleanup'].includes(status.state as string) ||
          !Number.isSafeInteger(status.durationMs) || (status.durationMs as number) < 0 ||
          (status.durationMs as number) > 240000) throw invalid();
      return { state: status.state as 'idle' | 'playing' | 'cleanup', durationMs: status.durationMs as number };
    }),
  };
}
