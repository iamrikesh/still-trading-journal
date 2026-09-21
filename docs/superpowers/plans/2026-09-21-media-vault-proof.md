# Media vault proof implementation plan

> **For agentic workers:** Use subagent-driven-development or executing-plans task by task. Checkboxes record actual completion.

**Goal:** Prove native streaming encryption and protected-key persistence with synthetic files on the S20, without touching journal data.

**Architecture:** A local Android Expo module owns a bounded Tink file vault and a debug-only synthetic proof API. A small development-only UI runs prepare/verify checks and shows sanitized results. This is the first independently testable increment of the approved voice design, not microphone capture or complete clip/SQLite recovery.

**Tech Stack:** Expo SDK 57, Kotlin, Android Keystore, Tink Android 1.23.0 (official setup docs checked 2026-09-21), existing TypeScript/React Native and Windows ARM64 Gradle workflow.

**Spec:** `docs/superpowers/specs/2026-09-21-voice-recording-design.md` (approved).

## Global constraints

- Keep work in the existing feature checkout and tool/cache tree to respect the approved low-disk workflow. Do not make duplicate dependency trees or native build directories.
- Use only synthetic fixtures under a dedicated no-backup proof directory and dedicated Keystore aliases. Never open, reset, read, log, copy or delete journal data/keys.
- Native media bound: 4 MiB; transfer in bounded chunks; no media/key bytes in JavaScript.
- A ciphertext file is authenticated completely before returning any plaintext file as usable; remove partial outputs on error. Never overwrite existing destination files.
- Missing wrapping keys or keysets with existing data fail closed. No plaintext key fallback. Private filesystem paths and native exception messages do not cross the bridge.
- Release builds must reject proof operations natively, even if called without the debug UI. No microphone permission/library in this increment.
- Reuse S:, JDK, SDK, Gradle cache, two workers and ARM64. No clean build, emulator or APK copy.

## Task 1: Native vault and isolated proof API

**Files:** `mobile/modules/still-media-vault/package.json`, `expo-module.config.json`, `android/build.gradle`, `android/src/main/AndroidManifest.xml`, and Kotlin source/tests under `android/src/{main,test}/java/expo/modules/stillmediavault/`.

**Interfaces:** Expo module `StillMediaVault`: `prepareProof(): Promise<{fixtureBytes: number}>`; `verifyProof(): Promise<{checks: string[], fixtureBytes: number}>`. Prepare writes a persistent synthetic fixture once, with encrypted keyset; verify opens it without regenerating keys, checks bytes against the generated fixture and performs independent corruption/key-loss/cleanup checks in disposable proof namespaces. No IDs/paths/key material accepted or returned over this bridge.

- [x] Write native tests before core implementation. Cases: roundtrip, wrong AAD/key, ciphertext tamper/truncation, oversized input, existing destination preservation, failed plaintext cleanup. Use real Tink primitives with temporary fixture files and test keys; Android Keystore behavior is checked on device.
- [x] Run `:still-media-vault:testDebugUnitTest` with the existing short-path Gradle environment and observe the expected missing-implementation failure.
- [x] Implement native file operations with create-new destinations, generated/validated filenames, bounded input/output, cleanup and serialized ownership. Example contract:

```kotlin
fun encrypt(input: File, destination: File, context: ByteArray)
fun decrypt(input: File, destination: File, context: ByteArray)
```

Use Tink's `StreamingAead.newEncryptingStream` / `newDecryptingStream`; copy with a fixed byte buffer, enforce bounds during copy, close fully and sync completed output. Use a Keystore-backed AEAD to encrypt the Tink keyset; check key/keyset/data presence before creating anything.
- [x] Implement the two debug proof methods with sanitized failures and no journal dependency. Prepare is idempotent only after validating an existing fixture; verify never prepares on the caller's behalf. Native proof tests include key-loss failure without replacement, corruption rejection, and cleanup in isolated namespaces.
- [x] Run native tests to green and inspect a focused review before device installation.

## Task 2: Development-only teaching controls

**Files:** `mobile/src/development/MediaVaultProofPanel.tsx`, `mobile/src/development/mediaVaultProof.ts`, `mobile/tests/mediaVaultProof.test.ts`, and a small insertion into `mobile/App.tsx`. The distinct Panel suffix avoids Windows case-insensitive module-resolution collisions.

**Interfaces:** UI invokes prepare/verify serially and displays statuses/boolean check names. The wrapper uses `requireOptionalNativeModule` so the old APK and temporary web demo continue to show an unavailable state rather than crash. Never surface raw errors.

- [x] Add host tests for the proof controller: no automatic native calls, absent module, busy operation exclusion, sanitized failure, prepare does not claim verification, verify reports actual checks.
- [x] Run the new test alone and observe expected failure before implementation.
- [x] Implement the tiny controller and panel behind `__DEV__`, Android native build only. Buttons: Prepare test file and Verify test file. Explanation: generated test data; no microphone or journal contents. Print no bridge results to console.
- [x] Run `npm.cmd test` and `npm.cmd run typecheck`.

## Task 3: S20 proof, review and handoff

- [x] Check laptop free disk and authorized USB device outside the sandbox where required. Recreate S: only if unused; verify it resolves to this checkout. Retain existing caches and native outputs.
- [x] Verify autolinking detects `StillMediaVault`, build ARM64 debug incrementally and run `npm.cmd run verify:apk` plus signature verification. Install with `adb install -r` only after both pass.
- [x] Open through existing Metro/USB. Prepare fixture, stop the process, relaunch, then Verify. Record concrete sanitized check results; use private local diagnostics only if needed and exclude them from Git.
- [x] Run a final code/security review; fix important findings and retest the changed scope.
- [x] Update PROJECT-STATUS, the approved spec's implementation status, a dated review/lesson and graph navigation. Document test commands, result counts, disk observation and remaining microphone/media-metadata recovery gates. Commit the small reviewed milestone; do not merge/push without the user's instruction.

## Execution rulings and validation ledger

- Baseline: 20 Node tests and TypeScript checking passed on 2026-09-21 before implementation.
- Scope: this plan completes the design's first synthetic native-file proof only. SQLite clip migrations, clip deletion coordination, recorder/player UI and lifecycle tests follow in the next increment after native feasibility is known.
- Worktree choice: reuse the current non-main feature checkout, as the approved design explicitly avoids duplicate dependency/native build trees on this laptop.


## Completion evidence (2026-09-21)

Task 1: 21 native tests passed; native security review had no important findings. Task 2: 26 host tests/typecheck passed, panel lifetime and message findings fixed and re-reviewed. Task 3: incremental APK build/packaging/signature passed, installed on S20, prepared 65,536-byte fixture, cold-restarted and verified all ten checks. Only encrypted fixture/keyset remained. See docs/reviews/2026-09-21-media-vault-proof.md for exact scope and limitations. Remaining work belongs to the next metadata/file-recovery increment.
