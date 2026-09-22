# Record / Stop / Play — 2026-09-22

## Starting point and scope

Continued clean `codex/android-device-setup` at `52fc6d5`. Approved scope remains several four-minute clips per saved moment, foreground stop-and-preserve, private temporary plaintext and encrypted committed media. Existing S20 synthetic file/session evidence belongs to the September 21 review; it does not verify microphone recording.

Baseline: 67 Node tests passed. Authorized Windows disk query showed 13.75 GiB free before installation (later 13.92 GiB); whole-drive measurements include unrelated activity. ADB initially saw no phone; Rikesh connected/unlocked the S20 and ADB then reported an authorized SM-G981U1. No app data was cleared.

## Implementation decisions

- Installed SDK-compatible `expo-audio` **57.0.5** in the existing dependency tree; npm reported two packages added, one removed, 506 audited and zero reported vulnerabilities. That output is not a complete dependency security audit.
- Read exact SDK57 Audio docs and installed Android source. Its recording path is random under cache/documents, and its foreground/background code pauses/resumes recorder and player. The approved design explicitly allows a native adapter when required for durable pre-capture path registration. This increment uses Expo Audio's permission request API and an owned Android recorder/player adapter; it does not claim to use Expo Audio's recorder/player classes.
- TypeScript captures the owner once, persists an intent through the existing journal queue before native capture, separates Stop from encrypted-save completion, and retains pending failure states. Controls appear only for saved Android moments; history opens clip detail. Clip pages contain at most 20 rows. Pending-owner discovery is separately bounded to 20 so an older pending clip is not stranded outside the newest 50 moments.
- Explicit pending-work recovery retries hidden deletion intents. Failed per-clip deletion refreshes state even on failure. Several clips append independently; retries retain the original ID.
- Permission is requested on Record. Audio plugin disables background recording/playback. A scoped config plugin removes the stale generated microphone `tools:node="remove"` entry left by no-clean prebuild while retaining other permission blocks.
- Reused the same checkout, restored S: as an alias, reused toolchains/caches and ran no-clean prebuild. Metro uses IPv4 and two workers; no emulator, clean build or APK copies.

## Host checks observed so far

- First new session tests failed for the missing audio adapter, then passed with the session facade. Controller tests similarly failed before the controller existed.
- Independent TypeScript review found a dropped Stop tap during an in-flight timer poll. A regression reproduced `pending` instead of `saved`; after fixing Stop to wait, it passed.
- Review also reproduced an unreachable hidden deletion intent that blocked new recording. Added explicit recovery and bounded pending-owner navigation. Real SQLite regression covers a pending owner behind 51 newer moments and failed deletion followed by recovery.
- Latest scoped check at this checkpoint: **11 recording controller/session tests passed**, TypeScript passed. Reviewer confirmed original findings resolved and no new critical regressions in the fix scope. Earlier broad check passed 76 tests before the two review regressions were added; final broad count will be recorded below.
- No-clean prebuild reproduced the stale microphone block, then the scoped plugin removed it. Generated manifest now has `RECORD_AUDIO` and `allowBackup=false`; packaged artifact checks still required.

## Native / device evidence

Native source review found an unconfirmed-release ownership gap, including startup/destruction paths. Failure tests reproduced it; the implementation retains unresolved handles and playback files, blocks affected mutations/new audio, and retains static module ownership after failed destruction cleanup. Scoped rereview found the finding addressed with no new critical/important regression. A process restart may be required when Android cannot confirm resource release.

The native suite passed **62 tests, zero failures/errors/skips** after those fixes and a final immutable-owner red/green regression. Final JUnit run completed in 1m31s. These tests use real Tink streams and fake audio-resource drivers, not a real microphone. The local Kotlin C:/S: workaround was moved to task-graph-ready configuration for only the local module and Expo generated module list; a subsequent run confirmed `incremental=false` and avoided cross-drive cache errors. Gradle deprecation warnings remain. No clean build was run.

Final combined review caught a cross-layer failure path: native release could remain unresolved while the UI cleared ownership. Native release is now a separate queued operation from encrypted saving. A cleanup phase retains ownership, provides Stop again in the panel and app-wide banner, and suppresses automatic retry polling. Three host regressions reproduced the bug, then passed. Scoped rereview found the blocker resolved.

Final host suite at this source checkpoint: **81/81 Node tests**, TypeScript and whitespace checks passed. Android Metro compiled 839 modules; the streamed bundle was discarded without creating an export copy.

Incremental ARM64 APK build passed in **5m51s**, 34 tasks executed / 335 up-to-date. APK is **80,112,890 bytes** at the existing output path. SQLCipher ARM64 packaging and v2 signature verification passed. Packaged manifest has `RECORD_AUDIO`, `allowBackup=false`, backup/data-extraction resource references, no audio foreground service permissions or audio services, and no external-storage permissions. The debug overlay permission `SYSTEM_ALERT_WINDOW` remains contributed by the generated debug manifest; release permission validation remains an open gate. SecureStore backup rules include shared preferences except SecureStore; durable media lives in no-backup storage. These checks are not an OEM backup/restore test.

`adb install -r` succeeded, preserving app data, and development deep-link launch returned Status ok. Rikesh subsequently unlocked the phone and explicitly authorized microphone tests. Free laptop disk after build: **13.71 GiB**, compared with **13.75 GiB** before installation (whole-drive readings, not a measured build-only delta).

### Actual S20 microphone checks

Only a synthetic sample moment was used. Diagnostics inspected status, duration, byte counts and file names; no audio was copied to the laptop or transcribed. Existing journals and media were retained.

- Permission was granted and real microphone capture started. Permission denial was not observed in this run.
- Explicit Stop saved the first clip: **47111 ms / 387262 encoded bytes**. UI reported Saved with Play/Delete controls.
- Playback entered **Playing**, and explicit Stop returned to ready. Filename-only inspection found ciphertext and the protected keyset, with no staging/playback temporary file.
- Rikesh reported the earlier sample's playback was **clear enough**. This is a user listening check for that sample, not an automated quality metric or a check of every recording.
- A second capture stopped after Android Home/app switch: **9613 ms / 79721 encoded bytes**. Both clips survived a full process stop and cold launch; both remained saved with **zero pending** operations, and total vault usage was **501199 bytes**, including pre-existing synthetic ciphertext. Playback of the short clip also returned to ready.
- Development startup was unusually slow. The first Record press lazily requested the Expo Audio chunk; Metro reported **93559 ms** compiling it. Changed the permission import to load with the main bundle, keeping the permission request itself on explicit Record. Following cold launch, Record started without another chunk download. TypeScript passed after this change. Cold development launch latency remains an environment issue to investigate; no standalone launch benchmark is claimed.
- Final uninterrupted limit test automatically stopped and saved at **239527 ms / 1965396 encoded bytes**. Native status reported stopped at 239764 ms; the validated file duration is below 240000 ms. UI reported Saved, no automatic restart occurred, and pending count was zero. The full-length clip entered Playing when requested.
- The first long-sample attempt was interrupted by an actual alarm at **50339 ms / 413753 encoded bytes**. Android focus-event timing matches the recorder stop, the clip saved, and recording did not resume. An earlier playback was similarly interrupted by a system notification. These are observed alarm/notification interruptions, not a simulated phone-call test.
- Device inspection exposed two UI issues: ordinary active capture was labelled as pending work needing attention, and Fast Refresh effect cleanup marked the controller backgrounded without another Android foreground event. The panel now suppresses pending-failure controls for an in-progress capture, and the root effect synchronizes with current AppState when attaching its listener. Device retest follows below.
- Retest after Fast Refresh: Record entered Recording again, the timer advanced past 1:27, and no pending-failure controls appeared during capture. Scoped independent review found no important regressions in these three device-driven edits. Final broad check after the edits passed **81/81 Node tests and TypeScript**.
- The second long attempt stopped at **108108 ms / 887523 encoded bytes**, followed by seven seconds of playback. This attempt does not verify the four-minute limit; the final timed attempt was started with an explicit request to leave the controls untouched.
- Deleted the two extra 50-second and 108-second samples through **Delete clip → DELETE**. Metadata then contained exactly three retained samples (47.111 s, 9.613 s, 239.527 s), zero pending operations and **2474347 bytes** total vault usage (about 2.36 MiB, including older synthetic fixtures). Filename-only inspection confirmed the two deleted ciphertext files and all staging/playback temporaries absent. No actual audio was exported.
- Final full process stop/cold launch: the same three samples remained saved with identical durations/byte counts, **zero pending**, native audio **idle**, and unchanged **2474347-byte** usage. The two deleted samples and temporary files remained absent. The sample moment was reopened on the phone. Final cached Metro bundle reported 45 ms compilation; earlier end-to-end development launch delays are not explained by that compile time alone.
- Restored the original `stay_on_while_plugged_in=0` and read it back. Removed owned UI dumps/screenshots. Metro and USB forwarding remain active for learning, one APK remains at the build output, and laptop free space is **13.71 GiB**. No new toolchain, emulator, clean build or audio export. Source/docs changes are uncommitted; no push or merge.

## Remaining acceptance and release gates

Actual permission denial, sub-second immediate Stop, rapid repeated device taps, a deliberate screen-lock interruption, phone calls/headphone changes, repeated-cycle resource profiling and device fault/low-space tests remain unrun. Several clips, playback, manual Stop, app switch, alarm/notification interruption, four-minute automatic stop and selective deletion were observed as described above. Low-space/tamper/missing-key host/native fixture tests do not by themselves verify actual voice behavior under those conditions. App unlock, encrypted backup/export/restore, missing-key recovery UX, release signing/privacy and release backup/permission checks remain open. No production-readiness claim follows from this development build.
