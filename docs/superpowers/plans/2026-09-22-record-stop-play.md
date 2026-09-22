# Record / Stop / Play implementation plan

> **For agentic workers:** Use test-first implementation and independent code review. Continue in the existing feature checkout to reuse dependencies and short-path caches.

**Goal:** Several individually recoverable four-minute voice clips per saved moment on Android.

**Architecture:** A single UI controller captures immutable clip ownership, serializes operations and distinguishes recording, saving and failure. The existing queued journal session persists intents and commits encrypted clips. A native Android audio adapter owns recorder/player lifetimes and vault paths; Expo Audio supplies runtime permission requests.

**Tech Stack:** Expo SDK 57, TypeScript, Android MediaRecorder/MediaPlayer, existing Tink vault and SQLCipher.

**Spec:** `docs/superpowers/specs/2026-09-21-voice-recording-design.md` (approved).

## Constraints and SDK finding

- Several clips per saved moment, 240000 ms maximum, mono AAC 64000 bps, 4 MiB encoded limit, 100 MiB reserve plus working space; warn at 250 MiB without deleting originals.
- Permission only on Record; immutable owner; no pause/resume or automatic restart. Native background/lock stops capture and playback. Stop/release playback before deleting temporary plaintext.
- Intent precedes native capture. Owned staging path is deterministic from clip ID. Preserve invalid/interrupted staging for explicit retry/discard. No arbitrary paths, keys or media bytes in screens.
- SDK 57 `expo-audio` 57.0.5 source inspected: recorder creates random cache/document paths; Android background handling pauses and foreground handling resumes recorder/player. Its duration timer is a coroutine. Use the spec's native-adapter fallback rather than relying on JS callbacks or modifying dependency source. Permission remains through Expo Audio; Android encoding/playback is owned by the adapter. This costs extra native lifecycle code and requires device validation.
- Reuse current checkout, JDK/SDK/Gradle caches; incremental ARM64 build, no clean, emulator or APK copies. No real journals/audio in repository or diagnostics.

## Task 1: Native owned audio and file boundary

- [x] Write failing JUnit coverage for capture-path admission, authenticated playback and cleanup, usage accounting and operation ownership.
- [x] Add vault methods `captureFile(intent): File`, `playbackFile(intent): File`, `removePlayback(intent)` and `usageBytes(): Long`. No overwrites; validate ownership and bounds; authenticate complete playback before exposing it.
- [x] Add native adapter and module methods `startCapture(id,momentId,createdAt)`, `stopCapture(id)`, `startPlayback(id,momentId,createdAt)`, `stopPlayback()`, `audioStatus()` and `audioUsage()`. Status contains only `id: String?`, `state: idle|recording|stopped|failed|playing`, `durationMs: Long`; no raw errors/paths.
- [x] Capture: native max duration/bytes, AAC mono 64 kbps, foreground admission, stop/release on background, audio focus loss, error and destruction. Stop is idempotent for matching ID. Retain finalized/failed staging. Playback: one authenticated temporary file, completion/background/focus cleanup, no auto-resume. Serialize vault mutations and lifecycle calls; stop affected operations before deletion/seal.
- [x] Run native JUnit task with existing short paths; review boundary and fix findings.

## Task 2: Controller, session facade and visible controls

- [x] Test immutable owner, duplicate taps, permission denial, navigation during permission/start, idempotent stop, failed finish/retry and playback cleanup with controlled external ports.
- [x] Implement `createRecordingController` with injectable `session`, `audio`, `permission`, `id`, `now` ports. Publish immutable UI state via subscribe/getSnapshot. Never log errors. Cancel start after navigation; keep pending intent on uncertain failure; retry uses same ID.
- [x] Add queued session media facade so begin/capture, finish, playback/deletion all share journal ownership. Native methods own files; session owns saved-owner authorization. Saved-only playback and 20-item clip paging.
- [x] Add native/web runtime adapters and `RecordingPanel`. Support screen enables Record only after saved; history opens moment clips. Timer, Stop, Play, Delete confirmation, pending Retry/Discard, older/newer pages, total audio usage and warning. Leaving screen/background stops and preserves.
- [x] Configure Audio plugin with background recording/playback false; intentionally remove microphone block. Run Node tests/typecheck.

## Task 3: Integration evidence and learning

- [x] Incremental ARM64 build, APK packaging/signature/merged permissions/backup checks; install -r only if phone available.
- [ ] Device exercise with synthetic speech: denied permission, two short clips, playback, immediate stop, app switch/lock, four-minute limit, cold restart and deletion. Record actual outcomes, separate unrun gates including calls/resource cycles.
  - Observed: several clips, manual Stop, playback, app switch, alarm/notification interruption, automatic 239.527-second save, deletion and final cold restart. User reported clear playback. Remaining denial/immediate/rapid-tap/lock/call/resource checks are explicitly open in the dated review; this checklist item is not claimed complete.
- [x] Write Lesson 6 with lifecycle and prediction exercise; update dated review and PROJECT-STATUS; refresh targeted graph links excluding generated/private files.
- [x] Independent native/controller reviews and final host verification; remaining device/release gates are individually recorded in the dated review. No push/merge requested.
