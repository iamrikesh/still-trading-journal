# still. — resume here

Updated 2026-09-20 after the first successful Samsung S20 device milestone.

## Current checkpoint

The first development increment runs on the Samsung S20 (SM-G981U1, Android 13). Emotion tap → immediate injecting logic → timestamped saved moment → history → deletion works. This is a development APK requiring Metro, not a standalone release or the full MVP. Use sample moments until the release gates are met.

Repository: https://github.com/iamrikesh/still-trading-journal

Current work is on `codex/android-device-setup`, pushed to GitHub. The device verification checkpoint is `5ab68aa`; later handoff/graph commits follow it. Do not switch to `main` assuming these changes have been merged. Check `git status` and `git log -5 --oneline` first.

## Completed and verified

- React Native, Expo SDK 57 and TypeScript foundation; six starter emotion/urge cards including Unsure.
- Original text injecting logic appears independently of asynchronous saving. Each tap captures its original timestamp and reminder text.
- Visible saving/failure/retry states. Retry preserves the moment ID and time. Unsaved drafts and displayed history are bounded to 50; older saved rows are not deleted by the display limit.
- Native SQLCipher database with a random key protected by SecureStore; no plaintext native fallback. Web and Expo Go are explicitly temporary, in-memory demos.
- Recent history, confirmed deletion, system/light/dark appearance. Theme selection is not yet persisted.
- 20 Node tests and TypeScript checking passed. Earlier browser interaction checks and web/Android bundle exports passed; see the dated review records for exact scope.
- S20: fresh FOMO tap saved, appeared in history, survived cold restart, and stayed deleted after deletion plus another restart. The pre-existing moment was preserved.
- Native SQLCipher reported `4.7.0 community`; protected-key presence and rejection of an unkeyed database read were verified. This is bounded evidence, not a complete security audit.
- APK signature and the new `npm.cmd run verify:apk` packaging check passed.
- Portable Java, existing Android SDK and one ARM64 build workflow are set up. No new emulator or Android Studio was installed. Last observed free disk: about 11.62 GiB.

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

Start with a short walkthrough of `mobile/App.tsx`, `src/journal/controller.ts` and `src/storage/`: understand why showing support and saving are separate operations. Let Rikesh try the current phone flow and make one small visible edit through Metro.

Then plan the first **Record / Stop / Play** increment. Before implementation, settle how recordings attach to a moment/session and how encrypted media is persisted and recovered. Verify current SDK microphone/audio APIs. Teach one concept at a time and use the S20 for actual permission and interruption tests. No voice recording is implemented yet.

## Remaining work

| Area | Status / next work |
| --- | --- |
| Voice capture | Record, stop, replay; permission denial; durable encrypted media; app-switch/lock stop-and-preserve; honest recovery status; no automatic recording restart |
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
- [Android device evidence](reviews/2026-09-20-android-build-setup.md): build, native tests and limits.
- [Graphify report](../graphify-out/GRAPH_REPORT.md), [interactive graph](../graphify-out/graph.html): source/document relationships. Query the graph to navigate, then verify claims against current source and this status file. Historical reports describe their own checkpoints.

Suggested next-session prompt: **Continue still. from docs/PROJECT-STATUS.md. Teach me the current tap-to-save flow, then help me plan the first secure voice-recording increment for the Samsung S20. Keep disk usage low.**
