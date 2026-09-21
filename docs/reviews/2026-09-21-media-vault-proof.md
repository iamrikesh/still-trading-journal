# Native encrypted-file proof — 2026-09-21

## Outcome

The debug APK on the Samsung S20 (SM-G981U1, Android 13) prepared a generated 65,536-byte fixture, survived a full app-process stop and cold relaunch, and passed all ten native proof checks. This is a foundation for voice recording, not recording itself or production readiness.

## Changes

- Local Android Expo module `still-media-vault`, autolinked without a new npm dependency tree.
- Tink Android 1.23.0, AES256_GCM_HKDF_4KB; media copied with 8 KiB buffers and a 4 MiB plaintext ceiling. Ciphertext has a bounded overhead allowance.
- Encrypted Tink keyset protected by Android Keystore. Missing wrapping key, missing/corrupt keyset, or existing orphan data refuses initialization. No plaintext-key fallback or silent key replacement.
- Generated filenames under a fixed app-private no-backup proof directory; create-new outputs, full authentication before return, partial-output cleanup. Native global lock serializes operations across module reloads.
- Explicit development panel: Prepare test file and Verify test file. One JS operation owner lives above page navigation; old APKs show unavailable instead of crashing. Check labels are allowlisted, all expected checks required, and native/JS errors are sanitized.
- Proof calls are guarded by native module DEBUG and application FLAG_DEBUGGABLE. No microphone permission, recorder dependency, journal migration or journal-key access was introduced.

## Automated evidence

- Baseline: original 20 Node tests and typecheck passed before implementation.
- Native TDD: expected missing-implementation failure observed; then 20 tests passed. A restart-cleanup regression was added, failed on the missing cleanup, then passed after the fix. Final XML: 10 streaming-file + 6 keyset-policy + 5 synthetic-proof tests = **21 tests**, zero failures/errors/skips. These run real Tink crypto; host wrapping keys substitute for Android Keystore.
- Host controller TDD: missing-module failure observed first; six new tests then passed. Final `npm.cmd test`: **26 tests passed**. `npm.cmd run typecheck` passed after resolving a Windows case-insensitive filename collision using `MediaVaultProofPanel.tsx`.
- Review found/fixed lost operation state across panel remounts and an overly broad failure message. Scoped re-review approved. Final native/security review found no critical/important defects within this bounded proof; initial-preparation recovery limitation retained explicitly.
- `git diff --check` passed.

## Build and artifact evidence

Reused S:, existing JDK/SDK/NDK and Gradle caches. Build command from Lesson 2:

```powershell
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-parallel --no-build-cache --no-daemon --console=plain
```

Build succeeded in **3 minutes 57 seconds**, 369 tasks: 36 executed, 333 up-to-date. The APK is **75,530,777 bytes**. `npm.cmd run verify:apk` confirmed ARM64 SQLCipher runtime packaging; `apksigner verify --verbose` passed signature scheme v2. `aapt dump permissions` showed no RECORD_AUDIO; merged debug manifest has `allowBackup=false` and `debuggable=true`. Existing development permissions, including SYSTEM_ALERT_WINDOW, remain. Release manifest/security review is separate.

Local Kotlin incremental compilation encountered mixed C:/S: roots. The new module's scoped workaround worked; Expo's generated module list then needed the same treatment and compiled via Kotlin fallback in this build. The ignored init file now scopes the setting to both projects; the expanded setting has not yet been exercised by a subsequent build. See Lesson 3. No clean, cache deletion, emulator or additional APK copy was used.

C: free space observed **14.98 GiB before** native work and **14.92 GiB afterward**. These are whole-drive readings, not exact attribution. The APK updated the installed app with `adb install -r`; Metro was retained.

## Physical S20 evidence

1. APK installation reported Success and launch reported COLD/ok.
2. On Now, scrolled to Learning: encrypted files; native panel available.
3. Prepare reported the test fixture prepared and **65,536 bytes**.
4. Used `adb shell am force-stop com.iamrikesh.stilljournal`, then opened the installed app through the Metro USB URL. Android reported a cold launch. Waited for the app to finish loading before scrolling; did not call Prepare again.
5. Verify reported **File checks passed** and all ten check labels:
   - encrypted fixture restored correctly;
   - wrong key and wrong owner rejected;
   - altered and truncated ciphertext rejected;
   - failed plaintext output cleaned up;
   - file-size limit enforced;
   - existing destination preserved;
   - missing wrapping key and missing keyset did not reset data.
6. Inspected filenames only in the proof directory: only `persistent/protected.keyset` and `persistent/fixture.cipher` remained. No plaintext or disposable check files remained. No file/key contents were exported. The automation helper initially could not print Unicode checkmarks under the Windows console encoding; switching its output to UTF-8 allowed inspection of all labels. This was a helper-output issue, not a native proof failure.

ADB UI interaction used an ignored local helper and restricted reported UI text to test labels. Existing journal entries/keys were not read, exported, edited or deleted by these checks. This does not add a new regression claim for original journal persistence after the APK update.

## Limits and next increment

Initial fixture preparation deliberately refuses repair after an orphaned key/keyset or incomplete fixture. Valid retained ciphertext permits cleanup of known generated plaintext after restart; no general interrupted-save recovery is claimed. Never recommend clearing app data to repair this proof. Any repair must target only the dedicated synthetic namespace/aliases.

Native release guards were reviewed in source, not executed in a release artifact. No audio quality/duration/lifecycle, general media/SQLite transaction recovery, missing-key user recovery, backup/restore, release privacy or sustained native-memory measurements were performed. The next increment is recoverable clip metadata/file commit and deletion with synthetic fixtures, followed by Record/Stop/Play and actual S20 permission/interruption testing.
