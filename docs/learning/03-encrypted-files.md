# Lesson 3: a saved file needs its key

This increment uses generated test bytes, not a recording or a journal entry. The native proof and its keys live in a separate app-private no-backup namespace. Microphone capture is still a later increment.

## The concept

Encryption turns the original bytes into ciphertext. A key makes them readable again. Authenticated encryption also detects damage or use with the wrong context. We bind the test file to synthetic moment/clip identifiers so the same encrypted file cannot be silently reassigned to another owner.

The app stores an encrypted media keyset beside the encrypted fixture. Android Keystore holds the wrapping key that protects that keyset. Restarting JavaScript is not a persistence test: we stop and relaunch the entire app process before verification.

Preparing the fixture and verifying it are different operations. Prepare creates or checks the stored fixture. Verify must read the existing fixture and keys; it is not allowed to secretly prepare replacements when something is missing.

## Phone exercise

Use the updated development APK and Metro from Lesson 2. On the Now page, scroll to **Learning: encrypted files**.

1. Tap **Prepare test file**. Expect a 65,536-byte generated fixture and an instruction to restart.
2. Stop and relaunch the app process while keeping Metro available. Codex can perform the process restart through ADB; merely changing pages is insufficient.
3. Tap **Verify test file**. Expect ten named checks, including restored bytes, wrong-key/owner rejection, tampering/truncation rejection, size limits, destination preservation, failed-output cleanup, and missing-key/keyset refusal.

Prediction exercise: if the wrapping key disappears, should the app generate another key and show an empty journal? No. A replacement key cannot decrypt existing ciphertext; fail visibly and preserve data. The proof tests this using disposable test aliases, never the journal key.

The current installed APK must contain the local native module. An older APK shows the file test as unavailable; refreshing Metro alone cannot add native code.

## What the tests do and do not prove

Host JUnit tests exercise real Tink encryption with test wrapping keys. The phone exercise adds actual Android Keystore and process-restart evidence. The UI accepts only the fixed check names and never displays native exception messages, paths, keys or file contents.

This synthetic proof does not implement audio capture, app unlock, clip-to-database commit recovery, backup/restore, or production release validation. Initial preparation intentionally fails closed if interrupted before it leaves a valid fixture/keyset. It has no general repair/reset button. Never clear app data to repair this proof; that would also remove journals. Any future repair must target only the documented synthetic namespace and aliases.

## Repeat host checks

From `mobile/`:

```powershell
npm.cmd test
npm.cmd run typecheck
```

With the short-path environment in Lesson 2 configured, from `S:\mobile\android`:

```powershell
.\gradlew.bat :still-media-vault:testDebugUnitTest -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-parallel --no-build-cache --no-daemon --console=plain
```

See the current PROJECT-STATUS and dated review for the checks actually observed. Keep synthetic diagnostics and APKs out of Git.

## Local-module build note

Expo autolinking resolves the local Kotlin module and Expo's generated module list to C: paths, while the native build root uses S:. Kotlin incremental compilation cannot relativize those paths across drives. This laptop's ignored `.local-tools/gradle/init.d/still-local-module-paths.gradle` disables incremental compilation only for these two projects:

```groovy
gradle.taskGraph.whenReady { graph ->
    graph.allTasks.findAll { task ->
        task.project.rootProject.name == 'still' &&
        task.project.name in ['still-media-vault', 'expo'] &&
        task.name.startsWith('compile') && task.name.endsWith('Kotlin')
    }.each { task ->
        if (task.hasProperty('incremental')) task.incremental = false
    }
}
```

On September 22, the earlier hook did not reliably disable incremental compilation. Applying the same two-project setting when the task graph is ready restored the intended `incremental=false` value; subsequent native tests avoided the cross-drive cache failure. This local hook assumes the current workflow without Gradle configuration caching.

Retain the short-path cache and all other modules' incremental work. Do not run clean or duplicate the project to address this local path issue. This ignored machine setting must be recreated on this laptop after a fresh clone; environments without drive aliases may not need it.
