# Personal Reminders and History Implementation Plan

> **For agentic workers:** Use subagent-driven-development task-by-task with review. User authorized autonomous decisions and completion; no routine approval pauses.

**Goal:** Complete custom emotion/reminder editing, encrypted media import/playback, older moment browsing and persistent appearance.

**Architecture:** Bounded attachment payloads join the SQLCipher database and existing serialized owner. A native system-picker/import/playback boundary validates media and shares audio exclusion with journal clips. Focused controllers and panels connect these capabilities without growing App into a storage layer.

**Tech Stack:** Expo SDK57, React Native0.86, Node24 SQLite tests, existing Kotlin module/JUnit, Android system picker.

**Spec:** `docs/superpowers/specs/2026-09-23-personal-reminders-history-design.md`

## Global Constraints

- Preserve all existing moments, clips, keys, sessions, writing and recovery.
- No automatic audio start or resume; reminder and journal audio cannot overlap.
- Android first, offline encrypted journal; no new broad media/storage/camera permissions.
- Image: JPEG/PNG, <=2097152 bytes, <=4000000 pixels, <=4096 pixels per side.
- Audio: WAV/MP3/MP4-AAC, <=4194304 bytes, 1..240000ms.
- Saved attachments total <=33554432 bytes. Never silently evict data.
- Max40 button definitions; label40, hint120, symbol8, support4000, action500 characters.
- Existing branch/checkout, S: toolchains, physical S20 and caches are reused. No data reset, clean build or emulator.
- No private journals, media, keys, local diagnostics or APKs in Git.

### Task 1: Native selected-media import and shared playback ownership

**Files:** Create native `ReminderMedia.kt`, `ReminderPicker.kt`, `ReminderPlayback.kt` and corresponding tests under `mobile/modules/still-media-vault/android/src/{main,test}/java/expo/modules/stillmediavault/`; modify `StillMediaVaultModule.kt`, `AudioOperations.kt` for explicit shared exclusion. Create `mobile/src/reminders/nativeReminders.ts` and adapter tests. No screen/SQL edits.

**Consumes:** Existing `AndroidAudioDriver`, `ClipOwnership`, foreground admission and Expo `RegisterActivityContracts` API (installed filesystem module is a usage reference). **Produces:** module methods and sanitized TS adapter:

```ts
type ImportedReminder = { kind: 'image' | 'audio'; mime: string; bytes: number; base64: string; width: number | null; height: number | null; durationMs: number | null };
interface NativeReminders {
  pick(kind: 'image' | 'audio'): Promise<ImportedReminder | null>;
  play(base64: string): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<{ state: 'idle' | 'playing' | 'cleanup'; durationMs: number }>;
}
// Native export names: pickReminder, playReminder, stopReminder, reminderStatus.
// No external URI, arbitrary native path or original provider error escapes pickReminder.
```

- [x] Red tests for bounded stream admission, base64 encoded-length and decoded-byte caps, image metadata bounds, audio metadata duration/mime, failed-release/cleanup ownership, stale callbacks and competing audio refusal. Inject platform decoding/driver at the pure Kotlin seam; actual Android decoder behavior gets device checks.

```kotlin
assertThrows(Exception::class.java) { readBounded(ByteArrayInputStream(ByteArray(MAX_AUDIO_BYTES + 1)), MAX_AUDIO_BYTES) }
```

- [x] Use temporary grant ACTION_GET_CONTENT + CATEGORY_OPENABLE, MIME filtering, single selection. Return null on actual cancellation; other errors sanitized. Keep picker registration/launch separate from lifecycle audio lock; prevent duplicate pick. Use installed Expo57 ActivityResultContract/Coroutine patterns. Source content URI stays native. Do not take persisted permissions or alter unrelated grants/source files.
- [x] Read exactly once through a bounded stream buffer; use IO dispatcher with a bounded timeout/cancellation and stream close. Provider blocking must not hold ClipOwnership or prevent Stop/background. Validate captured bytes; image bounds before full decode (then recycle), accepted actual MIME/header; audio `MediaDataSource`/retriever with positive bounded duration and no video. Return standard canonical base64 without wrapping and metadata; enforce limits before allocating decode buffers.
- [x] Add native explicit playback with a deterministic owned private temp file. Validate base64/content before writing, admit only foreground with journal audio fully released, then reuse AndroidAudioDriver.play. Shared native lock serializes starts/stops; status alone is insufficient to authorize if a release/cleanup obligation remains. Add narrow `requireReleased()`/equivalent to owners. Journal startCapture/startPlayback also refuses outstanding reminder ownership.
- [x] Completion, focus loss, screen off, background, destruction and Stop release playback and remove owned temp. Failed release/cleanup stays retained and retryable, blocks new audio, and surfaces `cleanup`. Callback generations prevent old completion stopping new playback. Stop is idempotent. Startup removes only this feature's deterministic orphan temp after journal/vault initialization; do not delete any clip files.
- [x] TS adapter validates payload/status shape, quotas and canonical encoding before returning to controllers; errors reveal no paths/base64. Missing bridge returns unavailable. Play calls require explicit caller action; no init/autoplay.
- [x] Run native focused JUnit, affected existing audio tests, host adapter tests and typecheck. Use S: Gradle env and two workers. Commit scoped implementation/tests and report actual commands/red-green results. Root handles APK installation/device acceptance after all native code is reviewed.

### Task 2: Persistent cards, attachment transactions, history and appearance

**Files:** Create `mobile/src/storage/reminderTypes.ts`, `reminderSchema.ts`, `reminderJournal.ts`, `mobile/tests/reminderJournal.test.ts`; modify `journalSession.ts`, `clipSchema.ts`, `tradingSchema.ts`, `types.ts`, `clipJournal.ts`, `journal/controller.ts` and affected tests. Optional façade fields preserve legacy/demo/test adapters. No UI edits.

**Consumes:** reviewed native `ImportedReminder` type, current schema3 and trading repository. **Produces:**

```ts
type ReminderAttachment = ImportedReminder & { id: string };
type EmotionCard = Emotion & { position: number; archived: boolean; revision: number; imageId: string | null; audioId: string | null };
interface ReminderRepository {
  list(archived?: boolean): Promise<EmotionCard[]>;
  save(input: { card: EmotionCard; image?: ReminderAttachment | null; audio?: ReminderAttachment | null }): Promise<EmotionCard>;
  move(id: string, direction: 'up' | 'down'): Promise<void>;
  archive(id: string, archived: boolean): Promise<void>;
  attachment(id: string): Promise<ReminderAttachment | null>;
  usage(): Promise<number>;
}
interface AppearanceRepository { get(): Promise<'system'|'light'|'dark'>; set(value: 'system'|'light'|'dark'): Promise<void>; }
// JournalSession.reminders?: ReminderRepository; appearance?: AppearanceRepository.
// Extend JournalRepository.list(before?: { createdAt: string; id: string }): Promise<Moment[]>.
// Existing native page size50; no global data cap. First call remains compatible.
```

- [x] Write failing real SQLite tests via `createJournalSession`, asserting facade presence then seed/reopen persistence. Use actual synthetic bounded base64 fixture bytes, no private media. Full content decoding is native's responsibility; repository validates canonical encoding, metadata and quotas.
- [x] Migrate3→4 transactionally, seed six existing definitions once, default system appearance. Admit supported0..4 in runtime, accept4 in clip/trading migration guards, retain media evidence checks for all media-capable versions. Unknown future schema fails closed.
- [x] Separate card metadata table from payload table. Save validates immutable ID and expected revision, updates text/attachment references and deletes replaced unreferenced payloads within the same transaction. Undefined attachment input retains, null removes, supplied value replaces with stable candidate ID. Retry identical completed Save returns stored result; stale differing Save rejects. No payloads in list queries.

```sql
SELECT id, label, hint, symbol, support, action, position, archived, revision, imageId, audioId
FROM emotion_cards WHERE archived = ? ORDER BY position, id;
```

- [x] Validate numeric bounds, exact base64 byte counts/canonical alphabet, correct image/audio kind and IDs, at least one support format, total quota after accounting replacements. Keep last active button; reject41st definition; archive/reorder atomically with stable ID order and no historical moment mutation. Input snapshots are taken before queueing.
- [x] Native moment paging uses exclusive descending `(createdAt,id)` cursor and existing deletion visibility. Controller `older()` retains pages on failure, exposes loading/end/retry state, deduplicates appended IDs, ignores stale responses after refresh/delete and avoids unbounded automatic fetching. A Newest refresh resets cursor. Ensure reading older rows never deletes them. Demo still explicitly temporary; no native persistence claim.
- [x] Persist appearance through the same queue with input validation. Failed preference write never reports durable success.
- [x] Cover seed idempotency, immutable moment snapshots, move/archive, quota and replacement rollback, payload-free queries, failed/stale saves, schema rollback/evidence, >50 tied history, older failure/retry and appearance close/reopen. Run full host suite/typecheck. Commit and report.

### Task 3: Reminder editor, playback, history and appearance UI

**Files:** Create `mobile/src/reminders/controller.ts`, `ReminderEditor.tsx`, `ReminderSupport.tsx`, controller tests; modify `mobile/App.tsx` and focused journal components as needed. No new SQL/native behavior without tests/review.

**Consumes:** `JournalSession.reminders`, appearance, paged journal controller, nativeReminders adapter. **Produces:** complete item2 UI.

- [x] Red controller tests for draft Save/Cancel, latest-owner import race, failed replacement retains previous draft, failed save retains edits, identical retry, explicit Play and pending Play cancellation on navigation/background. Test preference latest-write ordering and failed history page retry.
- [x] Now uses saved active cards, with starter fallback only for explicitly temporary demo/unavailable storage. Manage reminders lists active/archived cards; Add, edit, move, archive/restore with limits and errors. Old moment snapshots never become current edited text. Emotion tap remains immediate and timestamped.
- [x] Editor exposes label/hint/symbol/support/action, Import/Replace/Remove image/audio, preview, stated caps, Save and Cancel. Changes stay in the editor draft; leaving prompts Save/Discard. Failed import or cancelled picker cannot destroy previous media or save a partial card. Avoid showing importer errors as successful cancellation.
- [x] Current support lazily loads one image and loads audio only on Play reminder; no automatic media start. Stop controls and cleanup status stay reachable. Stop journal audio before reminder Play and verify confirmed release; native enforces overlap refusal. Stop reminder playback when leaving/backgrounding and before journal Record/Play; do not wait for an old picker/permission dialog to stop active audio. Revoke delayed play requests on navigation.
- [x] Add history Older/Newest, loading/end/retry feedback; every page entry opens existing notes/reflections/session/clip controls. Keep pending clip recovery reachable.
- [x] Load saved appearance and persist each explicit choice, retaining open drafts. On save failure show Not saved/Retry while keeping chosen appearance for the run. Theme affects every new panel with readable contrast/accessibility labels.
- [x] Run focused/full tests, TypeScript and Android Metro export; root performs S20 acceptance. Commit source/tests and report UX exercise steps plus any limitations.

### Task 4: Integrated S20 evidence, review and milestone completion

**Files:** dated review, lesson8, status/tracker, graph navigation. **Consumes:** all reviewed tasks and sessions/writing acceptance.

- [x] Incrementally build/test native module, verify APK packaging/signature/permissions, install -r using existing S: toolchains; no clean/reset. Cold restart and confirm preserved pre-existing media and new session/writing data. Completed September24 with reviewed native code and storage through f5f5a98; final UI acceptance must recheck preservation.
- [x] Generate public synthetic tiny PNG and WAV fixtures locally and copy only those to a clearly named phone folder. Exercise real system picker Cancel/import, image display, explicit Play/Stop/background, replacement/cancel/removal, custom labels/order/archive/restore, restart persistence, old-history paging and System/Light/Dark restart. Completed through b30b2d2; correction-wave changed flows get follow-up checks.
- [x] Check the owned private reminder playback temporary is absent after Stop/restart; inspect metadata/usage/memory only, no private payload export. Record native Android validation separately from JVM mocks. Remove only owned test fixture phone files after verifying exact paths; retain useful clearly synthetic app examples for learning. Exact eight owned files and empty phone folder removed; 50 disposable history rows removed after ownership/content checks, entry00 retained.
- [x] Whole-milestone review gets initial bc3aa1c through final HEAD, source/test evidence and ledger rulings; fix verified findings and rerun affected checks. Refresh graph from public source/docs only.
- [x] Update all four deliverable states with precise completed checks and limits; restore original USB stay-awake0; ensure audio stopped and pending work accounted for. Commit/push, verify remote SHA and clean worktree. Notify Rikesh with concise completed behavior, verification and remaining release gates.
