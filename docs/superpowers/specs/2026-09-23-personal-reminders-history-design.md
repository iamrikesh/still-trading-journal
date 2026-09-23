# Personal reminders, history and appearance

## Authority and scope

This completes the remaining item2 deliverables after sessions/writing. Rikesh delegated reasonable decisions and asked for autonomous completion on 2026-09-23. The defaults here are agent decisions under that instruction, not additional interview answers. Keep the existing original-capture/reflection, encryption and foreground-audio rules.

## Product behavior

### Custom emotion buttons

Seed the six existing emotions once on migration. Allow adding, renaming, changing hint/symbol/support/next action, moving up/down, and archiving/restoring buttons. IDs stay stable. Archive hides a button from Now without altering historical moment label/support snapshots. Keep at least one active button so immediate capture remains available. Use a maximum of 40 total button definitions for a manageable personal screen; explain the limit without silently dropping anything. Labels max40 characters, hint120, symbol8, support4000, action500. Empty labels reject. Text reminder may be empty when image/audio supplies support, but at least one nonempty reminder format is required.

Emotion tap continues immediately showing the saved reminder and creating a moment with the label/support text at tap time. Later customization cannot rewrite that moment. Reminder media belongs to the emotion's current support card; it is not a journal recording and is not copied into every moment. Old moment details retain their captured text; current reminder media is only offered as current support with clear ownership.

### Reminder editor and media

An explicit editor draft changes label/text and up to one image plus one audio attachment. Save commits the complete card atomically. Cancel or navigation leaves the old saved card intact; imported replacements stay only in the edit draft until Save. Failed import retains the previous draft attachment; failed Save retains draft text/media for Retry. Leaving a changed editor requires Save or Discard. Reject a stale async import result after owner changes or cancel.

Use Android's system file picker through a small native ACTION_GET_CONTENT contract, using the installed Expo57 activity-result API. The installed File.pickFileAsync uses persistent document grants; a temporary import contract avoids retaining source access and needing orphan-grant reconciliation. No additional package is required. Import existing image/audio only; no camera or reminder microphone feature is required. No broad storage permission. Never publish selected URI, file name or media content in logs.

Limits: image JPEG/PNG, at most 2MiB encoded, 4 million pixels and 4096 pixels per side; audio WAV/MP3/MP4-AAC, at most 4MiB and 240000ms. Reject spoofed/undecodable/oversized input before committing; native stream reading enforces the true byte limit even when provider metadata lies. Validate image bounds before decode and validate decoded format; validate audio against the actual bounded bytes. UI states these limits before import.

Store bounded attachment payloads in the existing SQLCipher database with metadata in separate columns. Base64 TEXT is accepted for the native/JS boundary with strict encoded-length admission and decoded byte checks. List/tap/card metadata queries never load payloads; fetch at most the requested image or audio payload. Total saved attachment bytes are capped at 32MiB and updates account for replaced bytes in the same transaction. At the cap, explain how to remove/replace attachments; never evict saved content.

Native imports never take a persistent document grant. Import the selected content URI under its temporary grant, return validated data only, and close provider streams on all outcomes. Cancelling a selection creates no imported attachment. No source document is changed or deleted, and unrelated grants are untouched.

Images render from the decrypted in-memory data URI, with no intentionally persisted plaintext copy. Audio starts only on Play reminder, using a private temporary file, and offers Stop. Reuse the existing native audio driver's focus/screen-off/headphone interruption semantics: stop, never auto-resume. Stop and delete the temporary on completion, leaving the card, background, lock or error. Retain and expose a retry obligation when native cleanup is unconfirmed; block competing audio until resolved. Startup removes only owned reminder temporaries after successful journal/vault initialization.

Reminder playback and journal capture/playback must never overlap. Native admission and a single serialized owner enforce this even if JS requests race. Pending old Play or picker callbacks cannot start audio after navigation/return. Opening the app/card/editor never starts audio. Pending journal save recovery remains reachable.

### Older history and appearance

Replace the recent50-only history UI with explicit bounded pages, preserving all native rows. Use `(createdAt, id)` descending cursors to avoid timestamp-tie duplicates. Newest reload resets paging; Older appends results with clear loading/end/retry states. Failed loads retain already displayed moments. Every older moment can open its recordings, notes, reflections and session assignment. Existing pending-owner recovery remains independent of the history page.

Persist System/Light/Dark in the encrypted journal. Read it on launch; initial system appearance is a safe temporary default. A saved explicit selection survives cold restart. Failed persistence shows feedback and keeps the user's chosen UI appearance for that run, with Retry. Theme changes must preserve open drafts, selected owner and audio cleanup state.

## Architecture choices

Recommended: extend the encrypted database for card metadata, bounded payloads and appearance; extend the existing native module for validated import and foreground-only playback. This avoids adding another key namespace and an encrypted-file/database reconciliation protocol for these deliberately small attachments. The tradeoff is base64/SQLite memory overhead, so metadata-only queries and strict quotas are essential and must be measured on the S20.

Alternative: a separate encrypted reminder-file vault scales to large attachments but needs its own ownership, staging, deletion tombstones and crash recovery. Defer until larger media is a real requirement. Plain app-cache attachment storage fails the agreed encryption requirement and is excluded.

## Verification

- Real SQLite tests: seed exactly once, preserve historical snapshots and archive/restore, stable reordering, reject invalid/oversized/cap-exceeding cards without altering old attachments, atomic replacement/failure rollback, payload-free list queries, stale editor writes, supported migrations and missing-key checks, page ties beyond50, preference reopen/failure.
- Native tests: bounded streams, malformed bytes/dimensions/duration, encoded-length rejection before decode, temp ownership/cleanup retry, interrupted startup and stale callbacks, journal/reminder mutual exclusion. Keep Android decoding/ContentResolver checks distinct from pure JVM fixture evidence.
- Controller tests: import/save/cancel owner races, failed replacement retains old draft, no auto Play, Stop/background/navigation, failed older-page retry and latest theme persistence.
- S20: system picker import using generated PNG/WAV fixtures, save/restart/display/play/stop, replace/cancel/remove, custom button/archive/reorder, older synthetic history and theme restart. Use no real journal exports or unattended microphone capture. Measure bounded attachment memory/usage without claiming a universal performance limit. Reuse S: caches and one incremental native rebuild; verify APK and preserve existing app data.
- Update project tracker, dated review, lesson and graph after verified increments; commit/push and verify remote. Completion means all four item2 deliverables have implementation and appropriate host/device evidence, not production readiness.

## Self-review

Separate moment snapshots from mutable current support. Save/Cancel and byte caps bound editor ownership and resource use. Native exclusion complements JS cancellation. Storage remains encrypted; no new release-readiness claim. The root integration plan will reconcile schema version admission and original media evidence at every migration.

## API evidence

Use [Android ACTION_GET_CONTENT](https://developer.android.com/reference/android/content/Intent#ACTION_GET_CONTENT) for importing a selected document with temporary access. Validate bounded audio using [MediaMetadataRetriever with MediaDataSource](https://developer.android.com/reference/android/media/MediaMetadataRetriever#setDataSource(android.media.MediaDataSource)). Expo57 activity-result registration is verified against installed `expo-file-system/android/src/main/java/expo/modules/filesystem/FileSystemModule.kt` and `expo-modules-core` activity-result interfaces; the filesystem web documentation endpoint was unavailable during research. SQLite integration follows the [versioned SDK57 documentation](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/).
