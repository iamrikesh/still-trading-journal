import type { ClipFileMetadata, ClipIntent, ClipVault } from './clipTypes.ts';

export type ClipFiles = { staging: boolean; final: boolean; pending: boolean; verification: boolean };
export interface NativeClipBridge {
  initializeClips(allowCreate: boolean): Promise<void>;
  sealClip(id: string, momentId: string, createdAt: string): Promise<ClipFileMetadata>;
  verifyClip(id: string, momentId: string, createdAt: string): Promise<ClipFileMetadata>;
  removeClipStaging(id: string, momentId: string, createdAt: string): Promise<void>;
  removeClipFiles(id: string, momentId: string, createdAt: string): Promise<void>;
  prepareClipFixture(id: string, momentId: string, createdAt: string): Promise<void>;
  inspectClipFiles(id: string): Promise<ClipFiles>;
}
export interface NativeClipVault extends ClipVault {
  initialize(allowCreate: boolean): Promise<void>;
  verify(intent: ClipIntent): Promise<ClipFileMetadata>;
  prepareFixture(intent: ClipIntent): Promise<void>;
  inspect(id: string): Promise<ClipFiles>;
}
const failure = () => new Error('Clip files unavailable. Existing data has not been reset.');
function metadata(value: ClipFileMetadata): ClipFileMetadata {
  if (!value || !Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > 4194304 ||
      !Number.isInteger(value.durationMs) || value.durationMs < 1 || value.durationMs > 240000) throw failure();
  return { bytes: value.bytes, durationMs: value.durationMs };
}
export function createNativeClipVault(value: unknown): NativeClipVault | null {
  const names = ['initializeClips', 'sealClip', 'verifyClip', 'removeClipStaging', 'removeClipFiles', 'prepareClipFixture', 'inspectClipFiles'] as const;
  if (!value || names.some(name => typeof (value as NativeClipBridge)[name] !== 'function')) return null;
  const native = value as NativeClipBridge;
  async function safe<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch { throw failure(); }
  }
  return {
    initialize: allow => safe(async () => { await native.initializeClips(allow); }),
    seal: intent => safe(async () => metadata(await native.sealClip(intent.id, intent.momentId, intent.createdAt))),
    verify: intent => safe(async () => metadata(await native.verifyClip(intent.id, intent.momentId, intent.createdAt))),
    removeStaging: intent => safe(async () => { await native.removeClipStaging(intent.id, intent.momentId, intent.createdAt); }),
    removeAll: intent => safe(async () => { await native.removeClipFiles(intent.id, intent.momentId, intent.createdAt); }),
    prepareFixture: intent => safe(async () => { await native.prepareClipFixture(intent.id, intent.momentId, intent.createdAt); }),
    inspect: id => safe(async () => {
      const result = await native.inspectClipFiles(id);
      if (!result || ['staging', 'final', 'pending', 'verification'].some(key => typeof result[key as keyof ClipFiles] !== 'boolean')) throw failure();
      return { staging: result.staging, final: result.final, pending: result.pending, verification: result.verification };
    }),
  };
}
