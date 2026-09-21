# still. — resume here

Updated 2026-09-21 after the approved voice design and successful native encrypted-file proof on the S20.

## Current checkpoint

The first development increment runs on the Samsung S20 (SM-G981U1, Android 13). Emotion tap → immediate injecting logic → timestamped saved moment → history → deletion works. The next foundation now passes: a separate synthetic file is encrypted by native Tink, survives a cold app restart with its Android Keystore-protected keyset, and passes ten displayed rejection/cleanup checks. Voice capture is not implemented. This is a development APK requiring Metro, not a standalone release or the full MVP. Use sample moments until the release gates are met.

Repository: https://github.com/iamrikesh/still-trading-journal

Current work is on `codex/android-device-setup`. Earlier checkpoints were pushed to GitHub; the 2026-09-21 design and native-proof work is local and has not been pushed. The original journal device verification checkpoint is `5ab68aa`; approved design/plan commit is `f302e65`; later proof/handoff commits follow it. Do not switch to `main` assuming these changes have been merged. Check `git status` and `git log -5 --oneline` first.

## Completed and verified

- React Native, Expo SDK 57 and TypeScript foundation; six starter emotion/urge cards including Unsure.
- Original text injecting logic appears independently of asynchronous saving. Each tap captures its original timestamp and reminder text.
- Visible saving/failure/retry states. Retry preserves the moment ID and time. Unsaved drafts and displayed history are bounded to 50; older saved rows are not deleted by the display limit.
- Native SQLCipher database with a random key protected by SecureStore; no plaintext native fallback. Web and Expo Go are explicitly temporary, in-memory demos.
- Recent history, confirmed deletion, system/light/dark appearance. Theme selection is not yet persisted.
- 26 Node tests and TypeScript checking passed. The native media module also passed 21 real-Tink JUnit tests. Earlier browser interaction checks and web/Android bundle exports passed; see the dated review records for exact scope.
- S20: fresh FOMO tap saved, appeared in history, survived cold restart, and stayed deleted after deletion plus another restart. The pre-existing moment was preserved.
- Native SQLCipher reported `4.7.0 community`; protected-key presence and rejection of an unkeyed database read were verified. This is bounded evidence, not a complete security audit.
- APK signature and the new `npm.cmd run verify:apk` packaging check passed.
- Native synthetic media proof: 65,536-byte fixture prepared, full app process stopped/relaunched, then all ten native checks passed on S20. Only ciphertext and encrypted keyset remained in the dedicated no-backup proof directory. No journal keys/rows were read or changed by the proof.
- Portable Java, existing Android SDK and one ARM64 build workflow are set up. No new emulator or Android Studio was installed. Latest free disk: 14.92 GiB, versus 14.98 GiB before native work (whole-drive observations).

## Resume development on this laptop

1. Open this repository in Codex and read this file, the latest Android review and Lesson 2.
2. Check the branch/worktree state. Connect and unlock the S20; authorize USB debugging if prompted.
3. Follow [Lesson 2](learning/02-android-device-build.md) for terminal environment setup. Use the `S:` alias and short Gradle cache path consistently for native builds. `S:` points to the existing project; it is not another copy. Recreate it after reboot if absent, never overwrite another drive mapping.
4. Start Metro with IPv4 preference and two workers, then forward USB port 8081. Open the installed development app at `http://127.0.0.1:8081`.
5. For JavaScript-only edits, use Metro. Rebuild the APK only after native dependencies/configuration change; run `verify:apk` before installing.

The session was wrapped up by stopping this project's Metro server and checking/stopping Gradle daemons. Installed tools, useful caches, the current APK and phone data are retained. The development app needs Metro started again next time. The drive alias may remain until reboot; it costs no duplicate storage.

### Setup pitfalls already resolved

- PowerShell blocks npm/Codex `.ps1` launchers: use `npm.cmd`, `npx.cmd` and `codex.cmd`; do not change execution policy merely to run these.
- Gradle rejects a trailing period in a project name: Expo's native name is `still`; UI branding remains `still.`.
- Long Windows paths caused Ninja failure and missing SQLCipher runtime-library metadata. The `S:` alias plus `S:\.local-tools\gradle` fixes this. No OpenSSL dependency patch is part of the final solution.
- Metro bound only IPv6 until `NODE_OPTIONS` included `--dns-result-order=ipv4first`. Use the IPv4 URL for USB forwarding.
- Expo SDK 57 prebuild recreates native folders by default. Use `--no-clean` for compatible repeat configuration changes to retain build files; do not routinely run Gradle `clean`.
- The local Gradle init file makes SQLite use the project's NDK, avoiding a second NDK download. It is documented in Lesson 2 and ignored by Git.
- If Codex says a thread has an active writer, do not resume that same thread concurrently. Start a new terminal session in this repository and use this handoff.

## Next learning increment

The tap-to-save source walkthrough was covered on 2026-09-21: `mobile/App.tsx` opens support without awaiting storage; `mobile/src/journal/controller.ts` captures ID/time/reminder text and publishes saving state before persistence; `mobile/src/storage/sqlJournal.ts` inserts once per ID and queries the newest 50. Retry retains the original snapshot. Failed drafts live only in memory; successful write and history-read status are separate.

Exercise completed (user-reported S20 evidence, 2026-09-21): Rikesh confirmed a fresh FOMO tap showed saved status and appeared in My moments. After the temporary Metro edit, he confirmed the new entry contained "I can pause. There will be another setup." while the older entry retained "A moving price is not an instruction. I can let this move go." This demonstrates reminder snapshots across taps. The starter source sentence has now been restored to its original text; saved phone entries were not edited or deleted. No new restart/encryption checks were performed in this exercise.

The temporary reminder edit passed `npm.cmd run typecheck` and `git diff --check`; Metro's health endpoint returned `packager-status:running`. Phone display and history comparison were subsequently confirmed by Rikesh as described above. No build or new dependencies were needed.

The voice design is approved: **several clips per moment, four minutes per clip**, foreground stop-and-preserve, and private temporary plaintext during capture/playback with encrypted committed files. The first native-file proof is complete; see [Lesson 3](learning/03-encrypted-files.md) and the [2026-09-21 evidence](reviews/2026-09-21-media-vault-proof.md).

Next: implement recoverable clip metadata/file commit and coordinated deletion using synthetic fixtures. Then add **Record / Stop / Play** with Expo Audio and actual S20 permission/lifecycle tests. The proof module is deliberately debug-only and accepts no real audio; extract its reviewed primitives into the real media repository when that increment is designed. Do not route recordings into the synthetic proof namespace.

### 2026-09-21 planning checkpoint

- Started on clean `codex/android-device-setup` at `8ffa557`. Fresh `npm.cmd test` passed all 20 tests; `npm.cmd run typecheck` passed. These are host checks, not new phone/security evidence.
- C: free space was 15.02 GiB using an authorized Windows disk query. The sandbox's zero reading was invalid. No dependencies, native builds, APK copies, emulator, Metro server or device-data operations were needed.
- Rikesh chose **several clips per moment**. Propose starting capture only after the moment is saved, with a separate immutable recording ID, moment ID and recording timestamp for each clip. Adding a clip appends rather than overwrites. Show a bounded/paged clip list with per-clip Play, Delete and save/retry status; one active capture at a time. Recording must capture its owner ID once and never follow a later selected emotion. Session grouping remains deferred.
- Proposed small sequence: prove encrypted file commit/recovery with a tiny synthetic fixture; add foreground Record / Stop / Play; verify interruption and failure handling on the S20. Support text stays independent of microphone permission and media saving.
- SDK 57 [Audio docs](https://docs.expo.dev/versions/v57.0.0/sdk/audio/) confirm recording/player APIs, runtime microphone permission, and cache as the default recording location. Plan explicit private durable staging with backup exclusions, and disable both background recording and playback. `expo-audio` is not installed; `mobile/app.json` currently blocks `RECORD_AUDIO`. Installing/configuring audio will require a native rebuild using Lesson 2.
- Compare native file streaming encryption (recommended to evaluate) with buffered encryption using existing `expo-crypto`, or a custom capture-to-encrypted-stream pipeline. The latter adds substantial recorder/codec work. SDK 57 [Crypto docs](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/) and installed source expose AES-GCM buffers, not a ready file-streaming interface. [Tink Streaming AEAD](https://developers.google.com/tink/streaming-aead) is a candidate to evaluate behind an Android adapter, not a selected or integrated dependency.
- Proposed save contract: persist a recording intent, stop/finalize and validate the private staging file, encrypt to a temporary ciphertext file, finalize that file, transactionally commit its metadata reference, clean staging, then report saved. Database and filesystem updates require restart reconciliation; they are not one atomic transaction. Keep recoverable failures visible and distinguish cleanup pending from complete success.
- Keep a separately managed media key protected by platform storage; authenticate recording/moment identifiers and format version. Missing keys must not trigger silent replacement or data reset. Plan tamper rejection, pending-file recovery, deletion retries and removal of associated audio when a moment is deleted. App unlock, backup/restore and missing-key recovery remain release gates.
- Plaintext exposure during capture and any temporary playback is a known design tradeoff: use private owned paths, minimize lifetime, reconcile leftovers, and never describe capture as already encrypted. Lock/app switch should stop and preserve, with no automatic restart; force-kill may leave an invalid unfinished recording, which must be reported honestly rather than promised recoverable.
- Rikesh chose about **4 minutes per clip** for the first voice increment. Plan a visible timer and automatic stop at four minutes, followed by the normal encrypted-save flow; another clip starts only on an explicit Record action. Several clips per moment remain supported in the plan. Proposed encoding is mono AAC at 64 kbps: about 0.48 MB/minute or 1.92 MB for four minutes before container/encryption overhead. Verify actual quality, size and native duration enforcement on the S20. Permit one recorder/player operation at a time, enforce native byte/duration limits, and reserve free-space headroom for staging plus ciphertext. Bound list loading and account for aggregate saved/draft bytes as well as per-clip size. Aggregate storage policy and headroom thresholds remain to be settled and measured. Never silently delete original recordings to free space.
- Acceptance work still to run: permission denial, immediate Stop/empty audio, repeated taps, lock/app switch, call/audio-focus interruption, cold restart, forced termination at save stages, low space, ciphertext tampering, missing key, deletion cleanup and repeated capture/play resource measurements. No voice behavior or media encryption was verified today.

Rikesh approved the concrete [voice-recording design](superpowers/specs/2026-09-21-voice-recording-design.md), including the private temporary plaintext tradeoff. Tink Android 1.23.0 with AES256_GCM_HKDF_4KB is now proven for the bounded synthetic-file use case. Proposed initial resource defaults are a 4 MiB clip ceiling, 100 MiB phone headroom plus working space, and a 250 MiB usage warning; real recording quality, usage thresholds and lifecycle behavior still need measurement.

Resume: read the approved design, [completed native proof plan](superpowers/plans/2026-09-21-media-vault-proof.md), latest evidence and Lesson 3. Use the installed updated APK and existing Metro server for the learning panel. Reuse tools/caches and `S:` for the next native build. The ignored local Gradle init file described in Lesson 3 avoids Kotlin C:/S: incremental-cache errors for `still-media-vault` and Expo's generated module list; no routine clean build is required.

### Native encrypted-file milestone (2026-09-21)

- Local Expo module, protected keyset, bounded streaming file operations and explicit development-only Prepare/Verify panel implemented. UI controller persists across page navigation; raw native exceptions are sanitized at native and JS boundaries. Native guards reject proof methods unless both module and application are debug builds (source inspected; release execution still untested).
- Verification: 21 native tests, 26 host tests, typecheck, incremental ARM64 APK build (3m57s; 36 executed / 333 up-to-date), SQLCipher packaging, v2 APK signature and no microphone permission. S20 prepare → force-stop → cold launch → verify passed all ten checks. Full evidence and limits are in the dated review.
- The 75,530,777-byte APK replaced the existing debug artifact and updated the app with `install -r`; no extra APK copy or emulator. No microphone dependency added. Metro is left running for learning; Gradle's single-use build daemon exits after its build.
- Known limit: interrupted initial proof preparation may deliberately fail closed on an orphan key/keyset or incomplete fixture. No reset button is shipped. Never clear app data to repair it; any future repair must be scoped only to the synthetic directory/aliases. General clip/SQLite crash recovery is still the next increment.

### Follow-up: phone exercise connected (2026-09-21)

ADB detected the authorized S20, USB forwarding for port 8081 succeeded, and Metro started with IPv4 preference, offline mode and two workers using the installed Expo CLI. The host health endpoint returned `packager-status:running`; opening the installed app at `http://127.0.0.1:8081` returned Android launch status `ok`, and Metro completed the Android bundle (782 modules). No APK rebuild or dependency installation was performed. Metro is intentionally left running for continued learning; repeat Lesson 2's Metro/USB steps if that process has stopped. Rikesh subsequently confirmed saved status, the history entry and the reminder-snapshot comparison. These are user-reported phone interaction checks, not new restart or encryption evidence.

## Remaining work

| Area | Status / next work |
| --- | --- |
| Voice capture | Synthetic native encryption/key persistence proof passed; next recoverable clip metadata/files, then Record/Stop/Play, permissions and S20 lifecycle handling |
| Personal support | Editable text, imported images, personal reminder audio, combinations; audio playback separate from capture |
| Sessions and review | Choose grouping behavior; start/end sessions, typed notes and retrospective reflections; preserve original captures |
| Design | Persist theme preference; broader themes, subtle animation respecting reduced motion, accessibility and device usability checks |
| Data ownership | Tested encrypted backup/export and restore; recovery design for missing keys; complete deletion/media cleanup |
| Security | App unlock, release permissions/backup validation, logs and secret handling, dependency review, lifecycle/failure tests; no absolute security claims |
| Performance | Measure phone memory, storage growth and responsiveness; bound media decoding, playback resources and large-history loading |
| CI | Workflow exists in `docs/ci/checks.yml`; inactive because current GitHub credential lacks workflow scope. Activate later with explicit credential authorization |
| GitHub integration | Feature branch is published; review/merge to the default branch remains. Graph and handoff are project memory, not proof all roadmap items are implemented |
| Release | Standalone signed preview APK, signing/key management, privacy documentation, test distribution, then selected public release channel; no store/cloud deployment yet |
| Portfolio | Add current device screenshots using synthetic data, walkthrough and eventual release link; keep decisions/tests/learning notes current |
| Later versions | A/B/C game protocol, transcription, evidence-linked patterns, preparation routines, accounts/sync, iOS and web review |

## Decisions to retain

Personal use first, Android first, room to grow. The app supports reflection rather than predicting trades or diagnosing emotions. Starter reminders are original and informed by the general ideas in Mark Douglas's and Jared Tendler's books. Tap automatically logs time and opens injecting logic. Support remains available if saving fails. Future recording stops and preserves on lock/app switch. Trading-session grouping and backup UX are not finalized. Success combines noticing earlier, pausing/following one's process and collecting useful reflection material.

Rikesh has some programming experience and wants to learn the core principles throughout. Each increment should explain the problem and concept, provide a runnable result and small exercise, and record concrete verification. Keep private journals, recordings, keys, APKs, local diagnostics and downloaded tools out of GitHub.

## Navigation

- [README](../README.md): capabilities and run commands.
- [MVP scope](../MVP-SCOPE.md): desired product; not all implemented.
- [Security and memory requirements](../SECURITY-AND-PERFORMANCE.md): release gates.
- [Lesson 1](learning/01-first-moment.md), [Lesson 2](learning/02-android-device-build.md): learning and setup.
- [Lesson 3](learning/03-encrypted-files.md), [native-file proof evidence](reviews/2026-09-21-media-vault-proof.md): encrypted fixture, key persistence, limits and next increment.
- [Android device evidence](reviews/2026-09-20-android-build-setup.md): build, native tests and limits.
- [Graphify report](../graphify-out/GRAPH_REPORT.md), [interactive graph](../graphify-out/graph.html): source/document relationships. Query the graph to navigate, then verify claims against current source and this status file. Historical reports describe their own checkpoints.

Suggested next-session prompt: **Continue still. from docs/PROJECT-STATUS.md. The S20 synthetic encrypted-file proof passed. Teach me recoverable clip saving, then build the next fixture-based metadata/file increment toward several four-minute voice clips per moment. Keep disk usage low.**
