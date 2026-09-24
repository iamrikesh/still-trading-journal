# Personal reminders, history and appearance — implementation evidence

Started from published `39539cc` on `codex/android-device-setup`, after [sessions/writing acceptance](2026-09-24-sessions-acceptance.md). The [approved design](../superpowers/specs/2026-09-23-personal-reminders-history-design.md) and [implementation plan](../superpowers/plans/2026-09-23-reminders-history.md) define the remaining journal milestone. This document records observed results, not expected completion.

**Current result:** all four journal deliverables are complete for the approved scope. Source `c68e85b` closes the whole-milestone review findings; task review, one final scoped re-review, bounded S20 acceptance, changed-flow checks, preservation and owned-fixture cleanup passed. Sections below preserve the evidence at each stage; earlier “not installed/verified” statements refer to that stage, not the final device checkpoint.

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

## Native-only picker probe — incomplete

While Task3 prepared new files, the reviewed runtime was briefly reopened before existing App/runtime edits. Fast Refresh was disabled using the installed native development-settings API; its exact preference was verified false, its reload completed, and the loaded reminder bridge was present before App edits resumed.

Calling the image picker opened Android DocumentsUI. Back returned to the app's Now screen, but Metro's inspector target list then became empty and the pending result could not be read. Filtered recent runtime logs showed no error. This establishes picker launch only, **not verified cancellation, import or decoding**; the cause of the inspector disconnect was not established. A similar debugger-loss pattern occurred during earlier device checks, but that does not prove a common cause.

The app was force-stopped and owned UI dumps removed. Fast Refresh remains false pending restoration after reviewed Task3 source is ready. No reminder was saved or audio started in this probe. Complete picker acceptance through the reviewed UI, without requiring an inspector result after each background transition.

## Task 3 UI/controllers — initial review and fixes

Committed **a641319**: [reminder/appearance controllers](../../mobile/src/reminders/controller.ts), [manager and editor](../../mobile/src/reminders/ReminderEditor.tsx), [current support](../../mobile/src/reminders/ReminderSupport.tsx), and [App integration](../../mobile/App.tsx). The implementation connects saved cards, draft Save/Cancel and guarded navigation, imports/previews, explicit media playback, coordinated journal audio entry points, Older/Newest, deletion invalidation and persisted appearance. Independent Task3 review found two Important audio issues below; this checkpoint is not approved and has not run on the S20.

Controller tests began red on the missing module. Later regressions exercised inherited audio from an earlier support card, Play racing a delayed Stop, failed initial appearance loading and duplicate pending Stop. Final focused tests passed13/13; full host suite **154/154**, TypeScript and Android Metro export (**691 modules**) passed, as did scoped whitespace checks. These are host/controller and bundle checks, not real picker/render/playback or Android persistence evidence.

The worker's Git escalation stalled after its sandbox could not write the index. After interrupting that request and verifying there was no active Git process, lock or staged change, root mechanically staged and committed only the six checked source/test files. No source edits or extra validation claims were introduced by that handoff.

Review probes reproduced two controller defects: repeated Play leaves the old native player running while the UI incorrectly reports idle; failed native start with retained cleanup does the same. This hides Stop and prevents status polling. Separately, a Record request waiting for reminder release can survive End session in the new wrapper and start afterward. The existing recording controller cannot cancel a request it has not received yet. Fix round1 is in progress; the passing initial suite did not cover these seams.

Review confirmed that normal Android picker background deliberately retains import ownership, allowing selection to return to the same editor; navigation/discard changes that ownership, while background revokes pending audio starts. The implementation report's earlier blanket background-cancellation wording was inaccurate. Deferred Minor observations cover an unguarded stale failed audio poll and missing appearance-read failure feedback within the editor; final review must triage these alongside the earlier stale-history test observation.


### Task 3 fix and approval checkpoint

Source `a641319` plus fix `b30b2d2` is task-approved after scoped re-review. Duplicate Play is refused; a failed start requests confirmed Stop and retains cleanup controls if release fails. End and explicit Stop synchronously cancel the wrapper admission before forwarding to the recording owner. Seven new regressions failed before the fix and pass afterward; final focused 20/20, full host 161/161, TypeScript and whitespace checks passed. Reviewer independently reran 7/7 scoped regressions. Three Minor observations across Tasks 2/3 remain for whole-milestone triage. Physical UI/media acceptance is underway, not yet complete.

Before that acceptance, exact owned fixture names/hashes and original 17-file vault set matched; reminder temporary was absent. Initial launch encountered a development error because USB reverse forwarding was absent. Restoring it allowed normal app launch without a reset or source change.

### S20 UI/media acceptance sequence

Reviewed JS through `b30b2d2`, existing reviewed native APK. Fast Refresh restored. The synthetic card **Feature test reminder Sep24** was created through the UI. Dark changed the editor without losing its entered label. Hardware Back and tab navigation showed Stay/Discard/Save; Stay retained the changed support, and Save left for history successfully. Draft background retention has not yet been verified: the development launcher intent reloaded the app, so it was not counted as an ordinary resume pass.

Actual system picker cancellation returned with no image attached. Files copied by ADB initially were absent from the Downloads provider view; indexing only the eight verified owned files and switching to list view made them selectable. Tiny PNG and 12-second WAV import, preview, Save and reopen passed. Oversized 5000-pixel PNG, invalid WAV and Opus-in-MP4 were rejected with the explicit import-failed message; previous draft media remained. AAC-in-MP4 imported and explicit Play exposed Stop.

The 2000x2000 PNG and exact 4194304-byte WAV imported; the PNG preview appeared and WAV playback produced a private temporary of exactly that size. Cancel removed the temporary and discarded those replacements. Subsequent repository metadata confirmed the saved 64x64/181-byte PNG and 12000ms/192044-byte WAV, combined usage192225. The ordinary WAV Play disabled duplicate Play and kept Stop reachable; Stop removed its temporary. Home during playback also removed the temporary. These are actual Android observations, separate from native fake-driver tests.

Metadata-only resource snapshots before/after boundary imports: PSS349675/399778KiB, native allocated114075/129247KiB, descriptors154/165, threads53/57. This is a short, unsettled observation, not peak-memory measurement or proof of leak freedom.

One UI tap captured the synthetic reminder. Editing its support afterward and saving through the leave-editor prompt changed the current card; repository comparison confirmed the one older moment retained its original support snapshot. Dark preference and small saved media were reloaded. Exact original17 media filenames remain preserved; last session probe had clip usage3920423, zero pending and native journal audio idle.

History fixture preparation created51 exactly labelled equal-time moments in the ended **Feature test history Sep24** session. Native repository pages returned50 then the remaining synthetic row, disjoint with equal timestamps. Actual UI Older/Newest and final fixture cleanup are still in progress; this preparation alone is not UI acceptance. Only fixture rows01..50 may be removed after ownership and absence-of-writing/clip checks; retain00 for the learning exercise.

### History and ordinary background follow-up

Actual UI Older loaded **Feature test history 00** after row01 at the50-row boundary. Its Original note screen opened; `Feature test older history remains writable.` was finalised. Returning from writing showed the existing Choose session grouping, Outside session and Record controls. Cleanup prevalidated all51 exact fixture rows and no added writing/clips on01..50, deleted exactly those50 through normal repository removal, retained00 and reported pending0. The refreshed history displayed the oldest-saved-moment message and its Newest control was exercised; no real entries were removed.

The synthetic reminder moved up one position, archived and restored through its card-specific UI controls. A temporary changed label survived Home and return through Recent apps. The keyboard reopened on that return; UIAutomator exposed underlying app bounds, so subsequent helper taps initially hit the keyboard. After explicitly dismissing it, Discard in the leave prompt restored the original saved card label. This was a test-helper issue; the unsaved synthetic edits were discarded. Ordinary background draft retention is now verified, replacing the earlier unverified launcher-return attempt. Attachment removal was saved and a real process cold restart has begun for persistence checks.

### Final pre-review-fix device checkpoint

True process cold restarts confirmed Dark, Light and System from encrypted preferences. Dark restart retained saved image removal with attachment usage192044. Reimporting the tiny PNG through the picker and saving restored usage192225; Light and System restarts retained image64x64/181bytes, WAV12000ms/192044bytes, card position5, updated current support, the older moment's original support and the finalised older-history note. The light/System and dark interfaces were inspected locally; no screenshots were published.

After the last restart:24 moments,7 active/0 archived cards, no active session, original clip usage3920423, zero pending, journal audio idle and native reminder idle. All eleven earlier duration/byte metadata pairs matched; exact original17 vault files matched; no reminder temporary remained. Sep23 examples and both Sep24 synthetic sessions, adjusted/original boundaries, final note, moment reflection and two final session reflections matched the earlier checkpoint.

Only the eight exact hash-verified owned picker files and their empty phone folder were removed. The two useful new app examples remain: **Feature test reminder Sep24** with its small image/WAV and captured old-text moment, and ended **Feature test history Sep24** with only row00 and its final note. Fast Refresh is verified true, stay-awake0 and timeout600000 unchanged. App force-stopped before review-fix source edits; owned UI dump removed. Metro and USB forwarding are retained for the final fix validation. An intervening phone call paused all device interaction until Rikesh explicitly confirmed it was finished; no call contents were inspected.

Whole-milestone source review found one Important session-timeline owner/cursor race and four Minor observations. Those remain open for the single correction wave and scoped re-review. These device results apply to source through b30b2d2; any changed flows receive an appropriate follow-up. Physical low-space, arbitrary provider failure, call/headphone audio interruption and resource/leak investigations remain outside this bounded acceptance; failure injections above are host evidence unless explicitly described as actual Android checks.

### Whole-milestone correction and scoped approval

The broad review of bc3aa1c..b30b2d2 found one Important session-timeline race: switching sessions could retain the previous owner's rows and cursor while the new first page waited or failed. It also recorded four Minor findings: weak stale-Older assertions, an unguarded old rejected reminder-status poll, missing appearance-load retry in the editor and absent global history session/archive labels.

One correction wave, **c68e85b**, addressed all five. Session pages now bind rows, cursor and load/retry status to an owner; initial switching clears prior rows and refuses Older until the current first page is ready. Failed Older retains only that owner's rows/cursor. Stale status failures use the audio generation guard. The editor exposes appearance load failure/retry without leaving its draft. History reads add optional current session/archive metadata with one parameter-bound join for at most50 IDs per page; saved Moment inputs and captured text stay unchanged, and temporary/legacy adapters remain compatible.

Red/green: new delayed/failed timeline switch regressions, stale rejected poll and archive-metadata tests failed before their corrections. Final focused56/56, full166/166, TypeScript, Android export691modules and whitespace checks passed. The single scoped re-review independently ran56/56 plus probes for stale timeline completion, same-owner Older retry and rejected polls after Stop. It approved spec and quality, with0 open Critical/Important/Minor findings in scope. Native/schema/dependency code did not change. Changed-flow S20 smoke checks follow; prior device evidence remains separately attributed to b30b2d2.


### Final changed-flow device check and completion

Cold-launched approved `c68e85b` with the same native APK. The populated **Feature test history Sep24** session showed its retained row00; switching to empty **Feature test Sep24 audio** showed no prior row or Older control. The delayed-success/failure race itself remains covered by host regressions, not a claimed Android fault injection.

Archiving only the owned history test session made its row display **Session: Feature test history Sep24 · Archived** in My moments. Restore removed the Archived suffix. The bounded metadata result reported the same session title, archived=false and unchanged captured support; its final note also remained intact.

Final combined probes again matched24 moments,7 active/0 archived cards,position5, System,64x64/181-byte PNG,12000ms/192044-byte WAV,total192225; immutable old reminder snapshot and older-history final note both true. Original17 clip files/3920423 bytes/all11 retained metadata pairs matched. Sep23 and both Sep24 synthetic sessions/writings matched the prior checkpoint. No active session, zero pending, journal and reminder audio idle, no reminder temporary. Fast Refresh true, stay-awake0 and timeout600000 unchanged. App left on Now; owned UI dump removed. Metro/USB development forwarding remain for the learning exercise; toolchains/caches and ignored local handoff remain private.

All four approved feature outcomes are complete. Final source166/166 host tests, TypeScript and Android export691 passed; unchanged-native79/79 evidence remains applicable. Broad review plus the single scoped correction re-review are approved, with no open findings in scope. Public docs and graph record this bounded result; nothing is merged into main, deployed or declared production ready. Shared-audio adversarial races, write/release/provider failures and explicit recovery limits remain attributed to the host/native seams unless the device sequence above states otherwise. Existing release and physical resource/interruption gates remain open.
