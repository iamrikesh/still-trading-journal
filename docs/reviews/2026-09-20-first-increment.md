# First increment: verification and limits

## Implemented

React Native/Expo SDK 57 application with original starter support cards, immediate support, timestamped moments, recent history/deletion and system/light/dark themes. Tap state is independent of asynchronous storage. Save retry retains ID/time; successful saves are distinguished from history-load errors. Pending and failed moment IDs are bounded to 50 without discarding older unsaved drafts.

Native persistence uses SQLCipher and a random 32-byte key protected by SecureStore. Missing keys with existing data, invalid keys and unavailable SQLCipher fail closed. Web/Expo Go are explicitly temporary demos. There is no plaintext native journal fallback.

## Observed checks

- TypeScript strict type checking passed.
- 20 Node tests passed, including real SQLite reopen/order/limit/deletion cases and controlled encryption bootstrap cases. Node reports its SQLite API as experimental.
- Three Playwright interaction checks passed in installed Microsoft Edge (Chromium): full tap/support/history/delete flow, themes and demo reload, and 360-pixel layout. Screenshots were inspected and retained using synthetic moments only.
- Android JavaScript bundle and browser export compiled.
- Expo Doctor passed 21 checks before adding the system-appearance package identified by native prebuild.
- Native Android prebuild generated SQLCipher-enabled configuration, disabled application backup, and removed microphone/storage/overlay permissions for this increment. Recording will explicitly request microphone permission in its own increment.
- npm audit reported zero known vulnerabilities after the scoped Xcode UUID override. This is not proof of overall application security.
- Independent review found and verified fixes for a native raw-path/file-URI mismatch and capture-ID failures hiding support.

## Not yet proven

No APK was built or installed during this increment: Gradle reported that `JAVA_HOME` is unset and `java` is not on PATH; no Android device was attached through ADB. Bundle export and native project generation are not device execution. The Samsung S20 still needs real SQLCipher/SecureStore, app restart, permission and lifecycle checks.

No live store release, Expo cloud build, real microphone capture, custom reminder editor, app unlock, encrypted media, backup/restore or device memory measurement is claimed. Security requirements in the root document remain release gates. Device-bound key loss currently has no recovery flow. Continue with sample moments only.

## Implementation choices awaiting future product work

Moments are ungrouped in this increment; session grouping and backup preferences were not answered before Rikesh asked to begin. Neither choice blocks the working support flow. Original support text is captured with each moment so later edits can preserve historical context. Theme choice is currently temporary; expanded palettes and durable preferences follow user testing.
