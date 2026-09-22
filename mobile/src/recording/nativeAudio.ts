import type { ClipIntent } from '../storage/clipTypes.ts';

export type AudioStatus = { id: string | null; state: 'idle' | 'recording' | 'stopped' | 'failed' | 'playing'; durationMs: number };
export interface NativeAudio {
  startCapture(intent: ClipIntent): Promise<void>;
  stopCapture(id: string): Promise<void>;
  startPlayback(intent: ClipIntent): Promise<void>;
  stopPlayback(): Promise<void>;
  status(): Promise<AudioStatus>;
  usage(): Promise<number>;
}
type Bridge = {
  startCapture(id: string, momentId: string, createdAt: string): Promise<void>;
  stopCapture(id: string): Promise<void>;
  startPlayback(id: string, momentId: string, createdAt: string): Promise<void>;
  stopPlayback(): Promise<void>;
  audioStatus(): Promise<AudioStatus>;
  audioUsage(): Promise<number>;
};
export function createNativeAudio(value: unknown): NativeAudio | null {
  const native = value as Bridge;
  if (!native || ['startCapture', 'stopCapture', 'startPlayback', 'stopPlayback', 'audioStatus', 'audioUsage'].some(name => typeof native[name as keyof Bridge] !== 'function')) return null;
  const failure = () => new Error('Audio unavailable. Your saved moments have not been reset.');
  async function safe<T>(work: () => Promise<T>): Promise<T> { try { return await work(); } catch { throw failure(); } }
  return {
    startCapture: i => safe(() => native.startCapture(i.id, i.momentId, i.createdAt)),
    stopCapture: id => safe(() => native.stopCapture(id)),
    startPlayback: i => safe(() => native.startPlayback(i.id, i.momentId, i.createdAt)),
    stopPlayback: () => safe(() => native.stopPlayback()),
    status: () => safe(async () => {
      const s = await native.audioStatus();
      if (!s || !['idle', 'recording', 'stopped', 'failed', 'playing'].includes(s.state) ||
          !(s.id === null || typeof s.id === 'string' && /^[a-z0-9-]{1,64}$/.test(s.id)) ||
          !Number.isSafeInteger(s.durationMs) || s.durationMs < 0 || s.durationMs > 240000 ||
          (s.state !== 'idle' && s.id === null)) throw failure();
      return { id: s.id, state: s.state, durationMs: s.durationMs };
    }),
    usage: () => safe(async () => {
      const bytes = await native.audioUsage();
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw failure();
      return bytes;
    }),
  };
}
