import type { JournalRepository } from './types.ts';

export type ClipIntent = { id: string; momentId: string; createdAt: string };
export type ClipFileMetadata = { bytes: number; durationMs: number };

/** Native integration contract, not supplied by this metadata coordinator.
 * Methods accept owned IDs, never paths. Missing keys/files fail closed.
 */
export interface ClipVault {
  /** Validate finalized staging/owner, seal and verify final ciphertext. On retry,
   * authenticate an existing final without overwriting it; retain useful staging
   * on failure. Return encoded-file bytes and finalized duration. */
  seal(intent: ClipIntent): Promise<ClipFileMetadata>;
  /** Idempotent; remove staging only, never the committed final. */
  removeStaging(intent: ClipIntent): Promise<void>;
  /** Idempotent; remove every owned staging, final and playback file. */
  removeAll(intent: ClipIntent): Promise<void>;
}

export type Clip = ClipIntent & {
  status: 'pending' | 'cleanup-pending' | 'saved';
  bytes: number | null;
  durationMs: number | null;
};
export type ClipCursor = { createdAt: string; id: string };

export interface ClipJournal {
  journal: JournalRepository;
  begin(intent: ClipIntent): Promise<void>;
  finish(id: string): Promise<void>;
  list(momentId: string, before?: ClipCursor): Promise<Clip[]>;
  remove(id: string): Promise<void>;
  /** One work item per moment deletion or unfinished clip, attempted once per
   * pass in bounded pages. Failed moment clips are counted with their owner. */
  recover(): Promise<{ completed: number; pending: number }>;
}
