# Native clip integration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax.

**Goal:** Connect the approved host clip coordinator to native Tink files and the single encrypted journal owner, then demonstrate fixture save/restart/deletion on S20.

**Architecture:** Keep the existing SQLCipher key and database. A single runtime session opens and migrates it, owns all journal/clip operations, and reconciles unfinished work on startup. Native operations accept IDs only and use a separate durable media namespace, with native serialization and module-lifecycle ownership. A debug teaching panel creates two generated WAV clips under a synthetic moment; it never records the microphone.

**Tech Stack:** Existing Expo SDK 57, SQLite/SQLCipher, SecureStore, Kotlin/Tink 1.23.0; Android MediaMetadataRetriever; existing Node/JUnit tests. No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-21-voice-recording-design.md` (approved). Existing coordinator contracts: `mobile/src/storage/clipTypes.ts` and `clipJournal.ts`.

## Global constraints

- Several clips per saved moment; duration 1..240000 ms, encoded size 1..4194304 bytes. Fixture: mono PCM WAV, 8000 Hz, 16-bit, one second (16044 bytes including header).
- No audio bytes, keys or native paths returned to JavaScript. Authenticate format version, clip ID, moment ID and original timestamp using an unambiguous length-prefixed UTF-8 encoding.
- Root `noBackupFilesDir/still-clips-v1`, Android Keystore alias `still.media-vault.clips.v1`. Never use or reset the earlier synthetic-proof namespace or journal key.
- Missing keys/keysets/orphan state fail closed; no silent replacement. Only initialize media keys when the keyed DB has no prior clip/deletion/tombstone evidence and native state is pristine. Reopening existing valid keys is always allowed.
- Generated lowercase `[a-z0-9-]{1,64}` clip IDs; moment IDs stay data, never paths. Native clip admission accepts empty legacy owner IDs, caps owner IDs at 1024 UTF-16 characters and timestamps at 128, and rejects malformed UTF-16 before strict UTF-8 AAD encoding; journal storage itself remains unrestricted. Preserve existing moments, journal key and timestamp/reminder snapshots.
- File plaintext is temporary and private. Final file verification authenticates the complete stream; failure removes generated verification plaintext, preserves useful staging and never overwrites a final. Cleanup errors remain failures.
- Require 100 MiB phone free-space reserve plus working-file allowance before fixture creation, encryption or verification. Inject available-space measurement in native unit tests; no destructive quota or automatic original-media cleanup.
- All public errors sanitized; debug fixture creation/inspection native guarded by both module DEBUG and application FLAG_DEBUGGABLE. No microphone permission/dependency or production-readiness claim.
- Reuse current feature checkout, S: mapping, toolchains and caches. No emulator, clean build, duplicate dependencies or extra APK copies. Baseline free C: space 14.86 GiB. Physical S20 authorized/connected.

## Task 1: Native durable file adapter

**Files:** add `ClipFileVault.kt`, `ClipFileVaultTest.kt` in the existing still-media-vault module; extend `StillMediaVaultModule.kt`; extend ProtectedKeyset with an optional domain-specific keyset AAD while retaining its proof default. Add a focused helper file only if it keeps Android metadata/lifecycle code separate and clear.

**Interfaces:** exported on existing `StillMediaVault` module:

```ts
initializeClips(allowCreate: boolean): Promise<void>;
sealClip(id: string, momentId: string, createdAt: string): Promise<{bytes: number; durationMs: number}>;
verifyClip(id: string, momentId: string, createdAt: string): Promise<{bytes: number; durationMs: number}>;
removeClipStaging(id: string, momentId: string, createdAt: string): Promise<void>;
removeClipFiles(id: string, momentId: string, createdAt: string): Promise<void>;
prepareClipFixture(id: string, momentId: string, createdAt: string): Promise<void>;
inspectClipFiles(id: string): Promise<{staging: boolean; final: boolean; pending: boolean; verification: boolean}>;
```

Regular file methods require successful native ownership initialization. A static lock serializes operations across module instances. Track the active module owner and a destroyed flag: another live module cannot claim it; OnDestroy releases only its own ownership and invalidates queued old-instance calls. Keep earlier prepareProof/verifyProof methods and namespace behavior intact. This is paired with one JS runtime database owner in Task 2; Expo SQLite's installed OnDestroy closes cached connections.

`ClipFileVault` accepts a native metadata inspector dependency for JVM tests; Android supplies MediaMetadataRetriever, closes/releases it, requires supported audio MIME and positive bounded duration, and checks file length natively. Fixture tests supply a strict WAV inspector; their streams use real Tink. This increment checks metadata/format and encrypted equality, not full decoder playback quality.

Paths are generated from clip ID: `id.staging.plain`, `id.pending.cipher`, `id.cipher`, `id.verify.plain`, `id.playback.plain`. IDs cannot contain dots, so compound role suffixes cannot collide with another clip ID. Extend OwnedFiles explicit allowed suffixes for these roles; retain old proof suffixes. Reuse OwnedFiles checks, exclusive writes, streaming bounds and fd sync. Keyset is `protected.keyset` in the same root. Initialize its protected key before fixture creation.

Seal protocol:
1. Validate intent and owned paths. If final exists, authenticate/decrypt/inspect it and return its metadata; never recreate/replace it from staging on failure.
2. If a pending ciphertext exists, verify it. A valid pending file can be finalized without staging. An invalid pending file may be removed/rebuilt only after a valid staging file is confirmed; otherwise preserve both and fail.
3. Validate staging; encrypt to pending; fully decrypt/authenticate and inspect using the owned verification file. Remove verification plaintext in finally. Close/sync output before finalization.
4. Rename verified pending to final on the same filesystem only if final is absent; require success. Android production path also syncs the directory if supported through a small platform dependency; failures propagate and retry validates existing final. Host tests are not power-loss evidence.
5. Return measured bytes/duration; staging stays until repository metadata commit then explicit removeStaging. Verify requires an existing final and cannot silently seal missing data.

Fixture preparation is debug-only, writes a valid tiny WAV using bounded buffers, and refuses to overwrite existing files. An identical fixture retry validates existing staging/final ownership. Inspection returns booleans only. Startup cleans only generated `*.verify.plain`/`*.playback.plain` leftovers, preserving staging/pending/final. removeAll idempotently removes all five owned file variants and never keys. Bind owner checks where content can be verified; path cleanup authority comes from the repository's durable intent.

- [x] Write failing JUnit tests for absent adapter, real Tink roundtrip/owner binding, final-only reopen, valid pending promotion, invalid pending with/without good staging, tampered final refusal despite good staging, metadata/byte limits, exclusive paths/destination preservation, cleanup and idempotent deletion. Cover initialization domain separation/key-loss behavior while retaining all21 existing tests.
- [x] Implement adapter and native bridge/ownership. No production fault-injection hooks. Use constructor-injected filesystem durability/metadata boundaries for native-vs-host responsibilities.
- [x] Run module tests through existing S: Gradle setup: `:still-media-vault:testDebugUnitTest -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-parallel --no-build-cache --no-daemon --console=plain`. Inspect JUnit XML count/failures.
- [x] Review and commit only native source/tests. No APK build/install by implementer; root handles one final build.

## Task 2: Single encrypted session and learning panel

**Files:** `mobile/src/storage/encryptedJournal.ts` (extract reusable generic keyed initialization), `openJournal.ts` and `.web.ts`, new `nativeClipVault.ts`, `journalSession.ts`, `nativeJournalSession.ts` as appropriate; new development `clipRecoveryExercise.ts` and `ClipRecoveryPanel.tsx`; small `App.tsx` wiring and deletion text; host tests for opener/session/exercise. Extend core only for a demonstrated necessary boundary.

**Interfaces:** Task 1 methods above. Adapt to ClipVault's seal/removeStaging/removeAll without retaining native errors. A session returns `journal: JournalRepository`, a serialized clips facade, and debug exercise operations; never expose DB or unwrapped repository to screens. Reuse current key validation/cipher handshake/secure-before-write behavior through a generic initialization callback, retaining existing createEncryptedJournalOpener tests/API.

Startup: open/key existing SQLCipher database; inspect schema 0/1/2. Initialize schema1 only for version0; for2 skip legacy createSqlJournal. Determine prior media evidence from clips/deletion/tombstone counts. Initialize native media with allowCreate only for pristine metadata; migrate with createClipJournal; run recovery before exposing session. Pending ordinary recovery remains visible and prevents starting another fixture/capture, while journal support remains usable; a broken DB initialization fails sanitized and closes its connection. Retry must not replace any key or data.

One runtime owner: cache native session initialization in a versioned `globalThis` slot so React remounts/Fast Refresh cannot create another connection/queue. One factory opens the database; every journal mutation and learning composition uses the same session queue. Expo SQLite native OnDestroy closes old context connections, while Task1 invalidates old native vault callers. Document that the transition from the prior app requires cold process launch after the new APK is installed.

Teaching exercise uses two native-generated fixtures, never private data:
1. Create a synthetic moment with generated UUID, emotionId `learning-clip-recovery`, label `Clip recovery exercise`, supportText `Generated clips for the recovery lesson.`. Persist only its generated ID/time in one-row `development_clip_exercise` table owned by this session (debug operations only). Marker lets cold restart verify completed deletion; it never contains journal text/keys/audio.
2. Derive IDs `clip-<moment UUID>-a` and `clip-<moment UUID>-b`. Save first normally; begin/prepare/seal second but deliberately stop before metadata finish. This composition holds the same session queue as ordinary journal deletion, preventing late file creation after deletion.
3. Display one saved/one pending and request full app restart. Startup recovery should finish second using existing final; Check reports two saved clips and authenticates existing finals only, with no staging/pending/verification files left.
4. Delete exercise calls coordinated whole-moment removal, checks marker-specific files absent and owner tombstone persisted. Keep marker so Check after cold restart verifies deletion. A new explicit Prepare after completed deletion allocates fresh IDs; do not resurrect tombstones. Validate marker and exact synthetic owner fields before any destructive exercise action. Normal history deletion confirmation says it also deletes attached clips.

Panel on Now: `Learning: clip recovery`, `Prepare recovery test`, `Check recovery`, `Delete test moment`. App-owned controller persists across navigation, serializes presses, sanitizes failures and clears stale success. No auto prepare/delete. Check must not implicitly recover the deliberate interrupted save before cold startup; it reports actual states. Older APK lacking new methods shows learning unavailable and journal stays usable with schema1 until install; never downgrade a schema2 DB. Web/Expo Go remain bounded temporary demos and do not create clip files.

- [x] Write meaningful failing tests for key/cipher ordering, schema1 preservation and schema2 reopen; old APK compatibility/newer schema refusal; startup recovery and missing media-key evidence; runtime single owner and queue composition; marker validation and sample-only deletion; prepare1saved/1pending -> reopen2saved -> delete/reopen absent; native errors/result bounds and repeated taps.
- [x] Implement the session and panel using existing package APIs; no new npm dependencies. Keep task1 native contract exact.
- [x] Run `npm.cmd test`, `npm.cmd run typecheck`, review and commit JS/tests only after passing.

## Task 3: Build, S20 exercise and handoff

**Files:** new Lesson 5 and dated integration review, PROJECT-STATUS, approved design status, targeted graph source/doc nodes.

- [x] Incremental ARM64 APK build via Lesson2, verify SQLCipher packaging/signature/no microphone permission, install with `adb install -r`. Reuse existing APK location.
- [x] Start/reuse Metro IPv4/two workers, USB reverse8081, cold launch. Exercise fresh sample only: normal save plus interruption; force-stop/cold launch; Check two saved; delete test moment; cold launch; Check deletion persisted. Inspect only owned fixture filenames/no keys or journal contents.
- [x] Record exact host/native test counts, phone results, disk before/after, and limitations. Native metadata validation is not microphone/playback evidence; power-loss, permissions/lifecycle, aggregate storage policy and release gates remain.
- [x] Update lesson/status/review and targeted graph excluding private data/dependencies/generated native files. Final review, local commit, no additional push/merge without user instruction.
