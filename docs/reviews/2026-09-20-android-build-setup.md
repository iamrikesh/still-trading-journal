# Android development build setup

## Verified

- Installed portable Temurin JDK 17.0.20.1+1 in the ignored `.local-tools/jdk-17` folder. The official archive's SHA-256 matched `e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0`; the ZIP was removed after extraction.
- Gradle wrapper 9.3.1 runs with that JDK. Its cache is project-local in `.local-tools/gradle`.
- Reused existing Android platform 36, build-tools 36.0.0 and ADB. Gradle also installed NDK 27.1.12297006, CMake 3.22.1 and build-tools 35.0.0 needed by library defaults. No Android Studio or emulator was installed in this task.
- ADB detected an authorized Samsung SM-G981U1 running Android 13 with ABI `arm64-v8a` during setup. The phone disconnected before installation.
- TypeScript checking and all 20 existing Node tests passed.
- A real `:app:assembleDebug` build succeeded: 349 actionable tasks, 317 executed and 32 up to date on the successful attempt. That attempt took 21 minutes 37 seconds, including first-time dependencies and compilation; earlier toolchain downloads took additional time.
- The resulting `mobile/android/app/build/outputs/apk/debug/app-debug.apk` is approximately 63.5 MiB. `apksigner verify --verbose` passed (APK signature scheme v2).
- `aapt dump badging` confirms package `com.iamrikesh.stilljournal`, version 0.1.0, minimum SDK 24, target SDK 36, launcher name `still`, and only ABI `arm64-v8a`.
- SQLite's generated CMake cache confirms `USE_SQLCIPHER=true` and NDK 27.1.12297006. This proves build configuration, not runtime encryption or recovery behavior.
- The merged debug manifest has `allowBackup=false`, and no microphone or broad storage permissions. Expo's debug manifest adds `SYSTEM_ALERT_WINDOW` despite the main manifest's blocked-permission configuration. The APK is debuggable and permits cleartext development traffic. Release manifest verification remains a separate gate.

## Changes and disk choices

The initial build failed because Gradle rejects project names ending with a period. Changing Expo's `name` from `still.` to `still` and regenerating Android fixed that failure. The in-app brand is unchanged.

SQLite otherwise selected the Android Gradle Plugin's default NDK 27.0.12077973. The second download was canceled, and the local Gradle initialization setting documented in Lesson 2 makes SQLite use the root project's NDK. The native SQLite build succeeded with that setting. The canceled download's approximately 93 MiB ZIP was removed; no pre-existing emulator or SDK components were removed.

The build targeted only ARM64, used two Gradle workers, disabled parallel Gradle projects and the build-output cache for this attempt, and used a single-use Gradle daemon. Dependency caches are retained to avoid repeating downloads. Metro is configured with two workers for this laptop's USB development workflow.

C: had approximately 18.4 GiB free at the start of setup and approximately 11 GiB at the final check. These are whole-drive observations, including other Windows activity; they are not an exact attribution of every byte to the project. Tool binaries, caches and APKs are ignored by Git.

## Follow-up device verification

After reconnection, the APK installed on the S20 and opened through Metro over USB. Metro initially bound IPv6 only; process-local `NODE_OPTIONS=--dns-result-order=ipv4first` and the `127.0.0.1:8081` URL fixed that connection. No Windows execution policy or firewall changes were needed.

The first phone run showed reminders but could not save. Android's native error identified a missing `libcrypto.so`. The old APK lacked it, and SQLite's CMake metadata had an empty `runtimeFiles` array. A subsequent build also failed at Ninja's 260-character path limit. Mapping the project to `S:` and using `S:\.local-tools\gradle` restored the runtime-file metadata and successful compilation without copying tools or dependencies. An initially considered OpenSSL dependency workaround was removed; the final build uses the existing dependency configuration.

The final short-path build succeeded in 3 minutes 15 seconds: 349 tasks, 24 executed and 325 up to date. The approximately 69.8 MiB APK passed `apksigner` v2 signature verification and the new `npm.cmd run verify:apk` artifact check. It was successfully installed with `adb install -r`. C: had approximately 11.62 GiB free after the rebuilds.

Verified on the phone:

- A FOMO tap displayed its reminder and the saved status; its entry appeared in history.
- Saved moments survived a full process stop and cold launch.
- The test moment was deleted through the app's confirmation dialog and remained absent after another cold launch. The pre-existing moment remained.
- SQLCipher reported `4.7.0 community`. The protected key was present with the expected format, and a separate connection without the key could not read the moments table. No key values or journal contents were exported to the repository.
- The previously unsaved moment was preserved in a temporary on-device SecureStore entry before the update, then restored with every original field verified after restart. The temporary recovery entry was deleted and its removal confirmed. This was a one-time development repair, not a shipped backup/restore feature.
- All 20 Node tests and TypeScript checking passed after the changes. Metro's IPv4 health endpoint responded successfully.

Release backup/restore and missing-key recovery, app unlock, broader lifecycle/failure checks, dependency security review and application memory measurements remain. These basic runtime checks do not establish production readiness or a complete security audit.

## Repeat the build

After configuring the terminal using Lesson 2, from `mobile/android`:

```powershell
$env:NODE_ENV = 'development'
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-parallel --no-build-cache --no-daemon --console=plain
```

For the usual connected-device build/install/Metro flow, prefer `npm.cmd run android -- --device` from `mobile/`.
