# Clip recovery core implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prove recoverable clip metadata, file commit and coordinated deletion with real SQLite and disposable synthetic files on the host before enabling these operations on S20.

**Architecture:** An opt-in repository owns schema 2, all journal writes on its database connection and a serialized queue. A narrow injected file-vault contract owns file validation, sealing and cleanup; tests use a noncryptographic filesystem fixture adapter. The installed app continues using its existing schema-1 opener and native synthetic encryption proof until a later native-adapter/device increment.

**Tech Stack:** Existing TypeScript, Node test runner and node:sqlite. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-21-voice-recording-design.md`, especially Save and recovery protocol and Playback and deletion.

## Global Constraints

- Several clips per moment, about four minutes per clip; four-minute duration ceiling = 240000 ms and encoded-file ceiling = 4194304 bytes.
- UI keeps IDs, durations and status; it never keeps audio bytes or keys in React state.
- List clips 20 at a time. No unbounded in-memory recovery list.
- Missing or invalid files/keys must preserve recovery records, fail closed and never silently replace committed media.
- Same clip ID retries must preserve original owner and timestamp. Deleted IDs cannot be resurrected by stale callbacks.
- Keep private journals, recordings, keys, APKs, local diagnostics and downloaded tools out of GitHub.
- Reuse the existing feature checkout and dependencies to keep disk low. No native rebuild, device mutation or new dependency in this host-only increment.
- This implements the metadata coordinator portion of the approved design. Native capture/playback, media-key management, real Tink file adapter, phone migration/lifecycle tests, aggregate file accounting/headroom and release gates remain separate work. Host fixtures are not encryption evidence.

## Task 1: Implement and test the opt-in recoverable repository

**Files:**
- Create `mobile/src/storage/clipTypes.ts`: public IDs/metadata/status/file-vault contracts.
- Create `mobile/src/storage/clipSchema.ts`: transactional schema 1 to 2 migration.
- Create `mobile/src/storage/clipJournal.ts`: serialized journal and clip operations.
- Create `mobile/tests/clipRecovery.test.ts` and `mobile/tests/helpers/clipFixture.ts`: real SQLite and tiny generated file fixtures with injected failures.
- Preserve `mobile/src/storage/openJournal.ts`, `encryptedJournal.ts`, `sqlJournal.ts` behavior and all deployed UI/native code.

**Interfaces:**

```ts
type ClipIntent = { id: string; momentId: string; createdAt: string };
type ClipFileMetadata = { bytes: number; durationMs: number };
interface ClipVault {
  seal(intent: ClipIntent): Promise<ClipFileMetadata>;
  removeStaging(intent: ClipIntent): Promise<void>;
  removeAll(intent: ClipIntent): Promise<void>;
}
```

`seal` validates a finalized owned staging file, authenticates its owner, produces verified final ciphertext and returns bounded validated metadata. On retry, it authenticates an existing final without overwriting it. It retains useful staging on failure. `removeStaging` is idempotent and must not remove the committed final; `removeAll` idempotently removes every owned staging/final/playback file. Neither accepts arbitrary paths. These are contracts to implement natively in the next increment, not functionality supplied by this TypeScript layer.

```ts
type Clip = ClipIntent & {
  status: 'pending' | 'cleanup-pending' | 'saved';
  bytes: number | null;
  durationMs: number | null;
};
type ClipCursor = { createdAt: string; id: string };
interface ClipJournal {
  journal: JournalRepository;
  begin(intent: ClipIntent): Promise<void>;
  finish(id: string): Promise<void>;
  list(momentId: string, before?: ClipCursor): Promise<Clip[]>;
  remove(id: string): Promise<void>;
  recover(): Promise<{ completed: number; pending: number }>;
}
// createClipJournal(db: JournalDatabase, vault: ClipVault): Promise<ClipJournal>
```

Existing schema 1 must already exist (initialize with createSqlJournal and cease using that repository before handing the connection over). Opening schema 2 reuses it; unknown versions reject unchanged. One ClipJournal owns the connection and vault namespace; repeated creation on the same database object must not create competing queues/owners. Exclude writes by the old repository while this owner is active; the native integration must enforce a single opener before it is enabled.

Database design: clip rows with owner foreign key, original timestamp, phase (`pending`, `cleanup-pending`, `saved`, `deleting`), nullable bytes/duration and bounded/check constraints; moment-deletion intents and durable clip/moment tombstones. Use RESTRICT ownership, never an automatic cascade that loses cleanup records. Migration runs in a SQLite transaction; rollback preserves schema version 1 and original rows. Enable and verify foreign keys before use. Stored metadata never includes absolute paths or bytes. Parameterize content; validate generated clip IDs before any vault call, bounded ASCII IDs compatible with native filenames; do not impose new ID restrictions on existing journal moments. Clip timestamps must be valid canonical ISO strings.

Save flow:
1. `begin` requires an existing non-deleting moment and unused, non-tombstoned clip ID; identical intent retry is idempotent; changed owner/time rejects.
2. `finish` seals/authenticates before metadata commit. Validate finite integer bytes 1..4194304 and duration 1..240000. Transactionally set metadata and cleanup-pending. A DB failure leaves the final plus original intent recoverable.
3. Remove staging only after metadata commit; then mark saved. A cleanup failure keeps cleanup-pending and never reports success. Retrying cleanup revalidates final metadata before removing useful staging. Already-saved finish is idempotent.
4. Recovery pages deletion intents and unfinished clips with a stable ID cursor, attempts each once per pass, continues past failures, and returns bounded counts. Failed entries remain persisted and retryable. Public errors are fixed messages without raw native/database messages or causes.

Deletion flow: persist deletion intent before file operations. Remove all files before row cleanup, retain a small tombstone that rejects stale begin/finish. Whole-moment deletion first marks the owner deleting, then processes all clips (including pending/cleanup-pending) in pages, only removes the moment after all cleanup succeeds. Hide deleting rows from ordinary lists. Do not lose the cleanup row on errors; restart resumes it. Save/delete/public queries serialize through the repository queue; a failed operation releases the queue. Late journal.save for deleted owners must not recreate them.

- [x] Write tests first. Initial red must demonstrate the absent repository; after creation, add failure cases before their fixes.

```ts
// Core observable assertions; fixtures use real SQLite and actual temporary files.
await repo.begin({ id: 'clip-1', momentId: 'moment-1', createdAt: '2026-09-21T10:00:00.000Z' });
// Seed the fixture staging file; inject DB commit failure after seal.
await assert.rejects(repo.finish('clip-1'));
// Close/reopen database and recreate repository/file adapter.
assert.deepEqual(await reopened.recover(), { completed: 1, pending: 0 });
assert.equal((await reopened.list('moment-1'))[0]?.status, 'saved');
// Assert exactly one clip, final retained, staging removed; repeat recovery changes nothing.
```

- [x] Cover migration rollback/preservation/newer-version refusal; several clips and idempotent retries; unsaved/deleting owners and invalid/conflicting IDs; stable 20-item pagination with timestamp ties; reopen after seal-before-DB-commit; cleanup-pending; missing/invalid staging and invalid metadata preserving records; tampered final on retry; individual and whole-moment deletion failures/restarts; stale save/begin/finish after deletion; bounded recovery past failures; concurrent save/delete ordering and queue release. Test SQL/filesystem errors without changing production code solely for fault injection; wrap test driver/vault boundaries.
- [x] Run `node --experimental-strip-types --test tests/clipRecovery.test.ts` from mobile and observe red.
- [x] Implement the interfaces and transitions above; split SQL/migration from coordination for readability. File fixtures must clearly label their noncryptographic behavior and use only generated bytes; clean exact owned temporary roots in finally blocks.
- [x] Run targeted tests, then `npm.cmd test` and `npm.cmd run typecheck`. No npm install.
- [x] Review the actual diff and contract; commit only these source/tests after checks pass. Root agent handles docs/graph/checkpoint separately.

## Task 2: Learning and handoff

**Files:** `docs/learning/04-recoverable-clip-saving.md`, `docs/reviews/2026-09-21-clip-recovery-core.md`, `docs/PROJECT-STATUS.md`, targeted graph outputs.

- [x] Explain intent -> verified final -> metadata commit -> staging cleanup -> saved; illustrate restart between final file and metadata commit. Give a laptop test exercise with a specific expected result.
- [x] Record precise automated evidence and limits; phone remains at the encrypted-file proof checkpoint. Update push status: GitHub feature branch was verified at 45862b2 on 2026-09-21, and subsequent recovery work is local unless separately pushed.
- [x] Refresh only relevant public graph nodes/relationships, exclude dependency/native generated/private files. Validate source paths and graph endpoints.
- [x] Run final appropriate checks, review, update this checklist and commit the local milestone. Do not merge or push later work under the earlier request to push the current checkpoint.


## Completion evidence

Source checkpoint: ef268d9. Twenty new host recovery tests plus 26 existing tests passed (46 total); root reran the full suite and typecheck successfully. Task and broad final review found no blocking defects. An outdated design status sentence was corrected. Graph paths/endpoints and documentation links were checked. The installed S20 app remains unchanged at its previous native file-proof checkpoint; no host fixture is encryption evidence. GitHub was pushed through 45862b2 before this increment; subsequent work remains local.
