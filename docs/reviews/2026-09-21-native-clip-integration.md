# Native clip integration — 2026-09-21

## Scope

Connect the host metadata coordinator to native Tink files and a single encrypted journal session. Use generated one-second WAV clips for the S20 recovery exercise. No microphone permission, recorder dependency, real recordings or production-readiness claim is part of this increment.

## Starting evidence

- Clean feature branch `codex/android-device-setup` at local checkpoint `93ffd3b`, ahead of GitHub by two commits. Published checkpoint remains `45862b2`.
- Existing host baseline: all 46 Node tests and TypeScript checking passed. An initial command from the repository root could not find package.json; the correct run from `mobile/` passed.
- S20 SM-G981U1 is authorized and connected over USB. Existing S: alias points to this checkout; no duplicate workspace was made.
- C: free space before work: **14.86 GiB** from the authorized Windows query. Sandbox reported zero and could not see ADB; those sandbox readings were not used.
- Metro's existing health endpoint returned `packager-status:running`. Reuse its existing IPv4/two-worker setup and the scoped Kotlin path workaround from Lesson 3.

## Implementation and verification

Native adapter commit `31a3698` passed independent task review (spec compliant; quality approved). The adapter uses collision-free dot-role filenames, strict length-prefixed UTF-8 authenticated ownership, final-file authentication before reuse, recoverable pending promotion, bounded metadata inspection and serialized module ownership. It reserves 100 MiB plus operation working space, caps clips at 4 MiB / 240000 ms, and keeps media keys separate from the journal and earlier proof.

- **47 native JUnit tests passed**, zero failures/errors/skips: 25 clip/ownership, seven protected-keyset, ten streaming and five synthetic-fixture cases. Red/green regressions covered filename collisions, empty legacy owners, malformed Unicode, staging-only cleanup and destruction-time ownership revocation. Real Tink streams run on the host; Android Keystore and Android metadata behavior require device evidence.
- Incremental ARM64 APK build passed in **2m30s**, 12 tasks executed / 357 up-to-date. Existing Kotlin C:/S: fallback and Gradle deprecation warnings were observed during native validation; no clean build or dependency change was needed.
- `npm.cmd run verify:apk` passed for arm64-v8a. `apksigner verify --verbose` passed with APK v2 signing. `aapt dump permissions` showed no `RECORD_AUDIO` permission; manifest inspection showed `allowBackup=false`.
- The existing APK artifact is **75,530,777 bytes**. The S: alias and ordinary project path resolve to the same updated artifact; no additional APK copy was made.

Journal-session integration is implemented in `f839ecd`. All journal/clip operations and composed teaching actions share one runtime session and queue. The keyed initializer retains the existing journal key and security ordering, while schema-2 startup bypasses the legacy opener and reconciles pending work. Prior clip/deletion/tombstone evidence prohibits creating replacement media keys. A generated marker permits scoped restart/deletion checks without storing journal text or keys in the marker.

- **67 Node tests passed**, including 21 new session/exercise cases; TypeScript checking and staged whitespace checks passed. New red/green regressions caught stale pending counts after both successful deletion and failed preparation.
- Host integration tests use real SQLite close/reopen and generated disposable files. They verify schema-1 snapshot preservation, schema-2 reopen, old-APK compatibility, key initialization ordering, failed-open closure, prior-media evidence, shared runtime ownership, serialized compositions, marker/owner validation, retries, deletion persistence and sanitized native/controller results. Host fixture files are deliberately noncryptographic.
- Read-only Check runs on panel mount; it never prepares or deletes fixtures and does not trigger recovery. Startup session initialization owns reconciliation. The learning controller clears old results and serializes presses.
- C: free space after implementation/build: **14.80 GiB**, compared with 14.86 GiB before work (whole-drive readings). Existing Metro remained healthy and the S20 remained connected. No emulator, dependency tree or extra APK copy was created.

Independent session review approved spec compliance and task quality with no blocking findings. Existing experimental `node:sqlite` output is disclosed tooling noise.

## S20 exercise

- `adb install -r` succeeded without clearing app data. USB port forwarding and cold deep-link launch succeeded. Initial launch briefly showed a blank screen before React Native reported `Running "main"`; subsequent UI inspection showed the learning panel. No source change was needed for that startup delay.
- **Prepare recovery test** displayed **1 saved · 1 pending** and the instruction to restart. Filename-only inspection of `no_backup/still-clips-v1` found two final ciphertext files, clip B's staging plaintext and the protected keyset. This is the deliberate interruption point after sealing B but before its metadata commit/cleanup.
- The process was force-stopped and cold-launched to test recovery. ADB subsequently went offline, then reported unauthorized after transport reconnect. After restarting the laptop's ADB service and user cable/authorization actions, `adb devices -l` again reported `device`. USB forwarding was restored and a fresh cold launch succeeded. No phone reboot, app-data reset or key replacement was performed. Development bundle loading took about 20 seconds on the observed successful reconnect; this is not a standalone app launch measurement.
- Startup and explicit **Check recovery** both displayed **2 saved · 0 pending**, with both finals authenticated and no staging/pending/verification files. Filename-only inspection confirmed exactly two `.cipher` files plus `protected.keyset`.
- A read-only development inspector query through the existing queued clip facade, restricted to this generated UUID, returned **16044 bytes / 1000 ms / saved** for each clip. No database handle, journal text, key or audio bytes were queried or returned. This verifies Android WAV metadata acceptance and successful native seal/verify/directory-sync operations at the exercise's scope.
- **Delete test moment** displayed **0 saved · 0 pending**, both clip files absent and deletion recorded. After another force-stop/cold launch, startup and explicit **Check recovery** displayed the same completed-deletion result. Filename-only inspection found only `protected.keyset` remaining in the durable clip directory.
- Final C: free space was **15.02 GiB** (intermediate 14.80 GiB, initial 14.86 GiB). Whole-drive changes include unrelated activity and are not an exact app storage measurement. The two generated clips were deleted through the application; the protected keyset and small exercise marker/tombstones remain for continuity.

## Review and continuation

Both task reviews and the broad whole-branch source review found no blocking issue. The final reviewer examined implementation and tests across the feature branch; generated graph payloads and every historical document were not deeply audited. One minor admission distinction remains: malformed UTF-16 is rejected when building authenticated data, while path-only deletion relies on the durable repository intent rather than authenticating owner text. This does not bypass ciphertext authentication. Tightening that admission contract can be considered with the recorder boundary.

Comments-only commit `7c2f1de` corrected two historical ownership comments. Its scoped re-review passed; executable behavior did not change, so tests and APK build were not repeated. The temporary local screenshot and device UI dump were removed after verification. Metro and the installed APK are retained for learning.

Implementation decisions: reuse the existing feature checkout/caches to limit disk use; use a versioned JavaScript session plus native ownership and a cold process upgrade; replace collision-prone hyphen role names with distinct dot-role suffixes. If revisited, these require workspace isolation work, lifecycle/competing-writer safeguards, or a file-layout migration respectively. The legacy journal key and earlier proof namespace are unchanged.

Graph navigation was refreshed only for inspected public source, tests and documentation: **265 nodes / 373 edges**. Local tools, dependencies, generated native output and private data were excluded. No new push or merge was performed; the published checkpoint remains `45862b2`.

The next increment is actual foreground capture/playback. Permission denial, empty capture, AAC quality/size, four-minute stopping, app switch/lock/call interruption, aggregate usage accounting, repeated resource cycles, backup/restore and release validation remain open. Existing journal snapshot preservation is covered by real SQLite host migration tests; this device exercise did not inspect or compare Rikesh's private entries.

## Required interpretation

Native metadata inspection validates file type, measured size and duration; it is not a complete decoder/playback or microphone test. Host fault injection does not establish Android process-kill behavior, and process restart does not establish power-loss durability. The durable clip directory/key must remain separate from the original encryption proof and journal key.

The native module serializes file operations and invalidates callers on module destruction. JavaScript owns one versioned runtime session and routes journal/clip operations through it. The installed Expo SQLite module's OnDestroy closes its cached database connections (source inspected at `mobile/node_modules/expo-sqlite/android/src/main/java/expo/modules/sqlite/SQLiteModule.kt`). The upgrade from the old opener requires a cold process launch; do not use a retained legacy repository alongside the new session.

The test reads only its generated exercise marker and fixtures for destructive actions. Existing moments are preserved by migration; record any device preservation checks at their actual scope. APKs, local UI dumps, screenshots, keys and journal contents stay out of Git.

## Session wrap-up addendum

At Rikesh's request, the completed source/docs checkpoint `f9e1587` was pushed to `origin/codex/android-device-setup`; `git ls-remote` verified `f9e158702a4e31a1c5159e1004257dea82633a93`. The following handoff/graph commit uses the same branch. The earlier statements about local-only work and running Metro describe the pre-wrap milestone.

Fresh wrap-up validation passed all 67 Node tests and TypeScript checking. No native rebuild or additional phone exercise was needed. The known experimental Node SQLite warning remains. Tracked-path checks found no APK, key, keystore, local-tools or private-data files. This is a scoped publication check, not a complete secret audit.

The verified project Metro process was stopped, and port 8081 had no listener afterward. The connected development app was force-stopped and its USB tunnel removed. Installed app data, keys, APK, dependencies and toolchain caches remain. Free C: space before shutdown was 15.04 GiB. See PROJECT-STATUS's Session wrap-up for the precise resume sequence and outstanding work.

## Sources checked

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) and [SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/); installed module source was also inspected.
- [Android MediaMetadataRetriever](https://developer.android.com/reference/android/media/MediaMetadataRetriever) for native metadata and resource release.
- [Android Os](https://developer.android.com/reference/android/system/Os) for filesystem synchronization.
