# Personal reminders, history and appearance — implementation evidence

Started from published `39539cc` on `codex/android-device-setup`, after [sessions/writing acceptance](2026-09-24-sessions-acceptance.md). The [approved design](../superpowers/specs/2026-09-23-personal-reminders-history-design.md) and [implementation plan](../superpowers/plans/2026-09-23-reminders-history.md) define the remaining journal milestone. This document records observed results, not expected completion.

## Starting state

- Sessions/writing source, host checks and bounded S20 acceptance are complete with the limits in their dated review. Final device baseline: exact 17 original files, 3920423-byte usage, eleven retained metadata pairs, audio idle and zero pending. The labelled Sep23/Sep24 sessions and writing remain.
- Native reminder import/playback, custom-card persistence, general history pagination and appearance persistence are not yet implemented at this starting point. The existing APK has no reminder bridge.
- Reuse the existing S: checkout alias, portable JDK17, Android SDK, Gradle caches and installed S20 app. Actual free C: space before native work was 11.32 GiB. No clean build, emulator, dependency install or extra APK copy is planned.
- Metro and USB forwarding are available. Phone stay-awake0 and screen timeout600000ms were preserved; no settings were changed for the preceding acceptance run.
- Existing ignored synthetic PNG/WAV generators and fixtures remain available for later system-picker checks. No fixture folder currently remains on the phone. Native implementation and review precede APK installation.

## Task 1 implementation — reviewed native boundary

Committed **a597f4b**: selected-media validation/import and shared audio ownership, with a pure TypeScript adapter. Independent task review found three issues below, fixed in **db9ea2f**. Scoped re-review approved both spec compliance and task quality, with no new blocking findings. Host/JVM fixtures establish only the exercised admission, lifecycle and cleanup rules; real Android decoding, system-picker grants and physical playback require subsequent S20 evidence. This code has not been installed on the phone.

Early red evidence: the focused native build reached test compilation and failed on missing reminder APIs (59 tasks, 2m33s), establishing that the reused toolchain reaches the new test boundary. The TypeScript adapter initially failed through its absent module.

A separate exact-limit probe then found that a valid 4MiB base64 attachment triggered a RangeError in the adapter's repeated-group regular expression. A linear alphabet/padding check replaced it; five focused adapter tests passed, and the root probe accepted both 192044-byte and 4194304-byte synthetic payloads. This validates the bridge shape/size check, not actual audio decoding.

Import cancellation is being reviewed separately from audio ownership. Kotlin's [withTimeout documentation](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines/with-timeout.html) distinguishes coroutine cancellation from blocking JVM work. The implementation must close owned streams and keep one import admission obligation until its worker exits, without holding the audio lock. Per-operation cancellation must not close a newer import. No hard termination guarantee is claimed for an uncooperative external provider.

The implementation introduced per-import tickets and a pending-Play ticket. Existing competing-audio tests also exposed a Kotlin trailing-lambda argument binding error during development; callback ordering was corrected. Review then found that the bridge queue and cancellation-close path did not yet enforce all the intended guarantees:

- Play validates synchronously on Expo's serial module queue, delaying Stop until validation finishes. Validation must run off that queue, with a final ticket check before playback.
- Cancellation closes the provider stream synchronously and can lose ownership of a still-running close. Cancellation must return promptly while one admission guard remains until both the worker and owned close finish.
- MP4 container metadata does not establish that its audio track is AAC. Track MIME must be checked from the captured bytes before acceptance.

Fix round 1 (**a597f4b..db9ea2f**) resolved all three. Play now suspends validation on IO, freeing the Expo module queue for Stop; a held-validation test delivered Stop and observed zero driver starts. Provider close uses one bounded asynchronous closer; a latch test confirmed prompt cancellation and continued admission refusal after the worker finished but close was still pending. MP4 validation uses MediaExtractor on captured bytes and requires one AAC audio track with no video; the seam rejects absent/non-AAC track metadata. Each regression failed before its fix. Scoped re-review approved all three changes.

Final fix verification: **79/79 native JUnit tests across 9 suites**, Gradle exit0 in46s with the same full command below, and staged whitespace check exit0. TypeScript did not change in this fix wave; **128/128 host tests and TypeScript exit0** remain the latest host evidence. Actual Android extraction/provider behavior remains unverified until Task4. Two small official AndroidX AAC/Opus MP4 test assets were obtained into ignored local storage for that check, alongside locally generated PNG/WAV fixtures; none has been copied to the phone yet.

Initial implementation checks before the review fixes: **76/76 native JUnit tests across 9 suites**, **128/128 host tests**, TypeScript exit0 and staged whitespace check exit0. The full native command from `S:\mobile\android` was `./gradlew.bat :still-media-vault:testDebugUnitTest -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-parallel --no-build-cache --no-daemon --console=plain`, which completed in1m8s. Existing toolchains/caches were reused; no clean build or APK install.

Source navigation: [bridge adapter and pure validation](../../mobile/src/reminders/nativeReminders.ts), [bounded media validation](../../mobile/modules/still-media-vault/android/src/main/java/expo/modules/stillmediavault/ReminderMedia.kt), [picker and import ownership](../../mobile/modules/still-media-vault/android/src/main/java/expo/modules/stillmediavault/ReminderPicker.kt), [playback ownership](../../mobile/modules/still-media-vault/android/src/main/java/expo/modules/stillmediavault/ReminderPlayback.kt). The remaining storage/UI/device tasks consume this boundary after review.

## Native APK preparation — not device acceptance

Published **908d06b** with matching remote SHA. After Task1 approval, the incremental `:app:assembleDebug` command with arm64-v8a, two workers, no parallel execution/build cache and no daemon passed in **2m55s**: 369 actionable tasks, 18 executed and 351 up-to-date. Existing JDK17/SDK/Gradle caches and the single debug APK were reused; no clean build or dependency install.

`npm.cmd run verify:apk` passed for arm64-v8a SQLCipher runtime packaging. `apksigner verify --verbose` passed with v2 signature and one signer. The APK permission dump contains no broad storage/media/camera permission. These checks do not prove device decryption, picker behavior or playback. The APK is not yet installed; the app was force-stopped to avoid running intermediate Task2 storage edits through Fast Refresh.

Eight generated/public files are now in an explicitly owned test folder in S20 Downloads. Exact filenames and SHA256 hashes were verified. AAC and Opus audio-only MP4 fixtures use `.m4a` names for the audio picker; payloads are unchanged. Owned fixture cleanup remains outstanding. No user media was copied out or replaced.

## Task 2 storage/controller implementation — reviewed

Committed **48a1721**: schema4 reminder card metadata and separate payload tables, one-time starter-card seed, atomic attachment replacement/removal, revision checks and identical completed-Save retry, archive/reorder, persisted appearance and exclusive 50-row moment paging. Optional session facades preserve the temporary no-vault adapter. The controller adds Older state/retry and invalidates pending page reads before deletion; App wiring remains Task3.

Source navigation: [reminder/appearance repository](../../mobile/src/storage/reminderJournal.ts), [schema4 migration](../../mobile/src/storage/reminderSchema.ts), [repository contracts](../../mobile/src/storage/reminderTypes.ts) and [paged history controller](../../mobile/src/journal/controller.ts).

New real-SQLite tests began red with absent facades/repeated first-page behavior; controller tests initially lacked Older. A further retry regression caught new-card retry incorrectly advancing its revision. Focused reminder tests passed9/9, controller/storage/legacy tests31/31, and affected migration/clip/trading tests57/57. Six initial full-suite failures came from schema3/future-version expectations and an old simulated schema2 rollback fixture; updated focused checks passed. Final **139/139 host tests**, TypeScript and whitespace checks passed.

Independent Task2 review found a controller failure transition: deletion invalidates an in-flight refresh, but an open/delete rejection leaves `historyStatus` at loading, disabling Older indefinitely. A reviewer probe retained the displayed50 rows and reproduced the stuck loading state. Fix **f5f5a98** settles the failed removal only while it owns the read generation, preserves retained rows/caller rejection, and protects a newer refresh. The regression went red (10/11 controller tests), then green (11/11), with TypeScript and staged whitespace checks passing. Scoped re-review approved spec compliance and task quality. A Minor test-strength observation remains for final review: an older stale-page test asserts only the first row rather than full IDs/paging state. Node SQLite checks exercise schema rollback, immutable snapshots, metadata-only list queries, queued input snapshots, quotas/atomic rollback, stale/identical saves, card limits, last-active protection, tied history cursors, late reads and appearance failure/reopen. They do not establish Android SQLCipher migration or encryption behavior. The following device check subsequently exercised the reviewed schema4 code; broader reminder/UI acceptance remains outstanding.


## Schema4 S20 migration and preservation

Installed the reviewed debug APK with `adb -d install -r` (Success), retaining app data, then cold-started the reviewed JavaScript source through **f5f5a98**. Initial launch waited for its bundle: Metro health responded, one host bundle request timed out at20s, and Metro later reported a completed bundle. The inspector then connected without an app-source change or data reset. The app displayed Now/My moments controls.

Native session/API inspection showed six active starter cards, no archived cards, metadata without payloads, zero reminder attachment bytes and System appearance. History returned22 current moments and an empty Older page. Audio was idle, pending0 and original clip usage3920423bytes. This is an actual existing-database migration/runtime check, not a new encryption audit.

Preservation comparisons passed: exact original17-file vault set and all eleven earlier duration/byte pairs. Sep23 session/note/reflection checks passed. Sep24's corrected/original boundaries, original capture time, final note, moment reflection and both session reflections remained; the second Sep24 session remained ended and empty. This restart also verified the latest finalized follow-up, which had only been draft-recovery tested before its previous finalization. No test capture or new moment was created in this migration check.

The filename comparison helper initially failed on its local Python encoding spelling before comparison; correcting it to `utf-8-sig` allowed the exact17-file assertion to pass. This was not an app or migration failure. App stopped after verification to prevent intermediate UI edits from executing through Fast Refresh; owned recording UI dump removed. Fixture folder remains for full Task4 picker tests. No permission/sleep/key settings were changed.
