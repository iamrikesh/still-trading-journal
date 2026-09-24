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
