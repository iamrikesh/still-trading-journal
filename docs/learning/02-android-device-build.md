# Lesson 2: build for a real Android phone

This milestone is a development APK running on Rikesh's Samsung S20. An APK build alone does not prove that encrypted storage works on the phone; we check that separately. The first device checks now pass; see the [verification record](../reviews/2026-09-20-android-build-setup.md).

## What each tool does

| Tool | Job |
| --- | --- |
| Node and Expo CLI | Run development commands and coordinate the build |
| JDK 17 | Run Java tools, including Gradle |
| Gradle wrapper (`gradlew.bat`) | Download the project's pinned Gradle version and build Android code |
| Android SDK | Supply Android APIs and packaging tools |
| NDK and CMake | Compile the C/C++ portions of React Native and native modules |
| ADB | Connect to the phone, install the APK, and forward Metro over USB |
| Metro | Serve JavaScript to the installed development app |

JavaScript edits usually need Metro, not another APK build. Changes to native dependencies or native configuration require rebuilding. SQLCipher requires our development build; Expo Go is only the temporary-memory demo.

## This laptop's small setup

- Reuse the SDK at `%LOCALAPPDATA%\Android\Sdk`, including platform 36 and build-tools 36.0.0.
- Keep portable Java in the ignored `.local-tools\jdk-17` folder.
- Keep this project's Gradle downloads in `.local-tools\gradle` so their location is explicit.
- Test on the phone. No new emulator, system image, or Android Studio installation is needed for this workflow.
- Build the connected device's architecture using Expo's `--device` option. Avoid `--all-arch` for daily development.
- Limit Gradle to two workers. First builds still download dependencies and may take several minutes.

The local tools folder is machine setup, not a committed project dependency. A fresh clone needs JDK 17 installed separately. Do not commit downloaded tools, SDK files, APKs, or device identifiers.

## Prepare the phone

1. Open **Settings > About phone > Software information** and tap **Build number** seven times. Enter your phone PIN if requested.
2. Open **Settings > Developer options** and turn on **USB debugging**.
3. Connect a USB data cable. Unlock the phone and approve the USB debugging prompt for your own laptop.
4. If the phone only charges, try its **File transfer** USB mode or another data cable.

## Configure one PowerShell terminal

From the repository root, after portable Java has been installed, check `subst` and choose an unused drive letter. This laptop uses `S:` as a short alias for the existing project folder:

```powershell
subst S: "C:\Users\Rikesh\Documents\ChatGPT\Trading App"
Set-Location S:\
$env:JAVA_HOME = 'S:\.local-tools\jdk-17'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:GRADLE_USER_HOME = 'S:\.local-tools\gradle'
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
java -version
adb devices -l
```

These environment variables affect this terminal and its child processes. They do not change Windows settings permanently. Repeat them in a fresh terminal. `JAVA_HOME` locates Java; `ANDROID_HOME` locates Android tooling; `GRADLE_USER_HOME` locates downloaded Gradle dependencies.

`subst` creates a drive alias, not a copy: `S:` and the original project folder contain the same files. Recreate the mapping after reboot; if it already points to this project, skip the `subst` command. Do not replace another drive's mapping. Use the short Gradle cache path consistently: the longer original path caused a Ninja 260-character limit failure and omitted SQLCipher's runtime library from the earlier APK. After all development processes stop, the alias can be removed with `subst S: /d` from a terminal outside `S:`; files remain in the original folder.

Our local `.local-tools\gradle\gradle.properties` contains:

```properties
org.gradle.workers.max=2
org.gradle.parallel=false
org.gradle.daemon.idletimeout=120000
```

The first two settings limit concurrent build work. The last stops an idle Gradle daemon after two minutes. This file is local setup, so a fresh clone needs it recreated if the same limits are wanted.

For SDK 57, `expo-sqlite` does not set an NDK version and otherwise selects AGP's older default, downloading a second compiler. This laptop's `.local-tools\gradle\init.d\still-sqlite-ndk.gradle` makes it use the root project's NDK instead:

```groovy
gradle.beforeProject { project ->
    if (project.name == 'expo-sqlite' && project.rootProject.name == 'still') {
        project.plugins.withId('com.android.library') {
            project.android.ndkVersion = project.rootProject.ext.ndkVersion
        }
    }
}
```

This is an opt-in local build setting, not a modification to `node_modules`. It applies before SQLite's build script; an explicit version added upstream can still take precedence. Recheck it when upgrading Expo. Cloud builds do not inherit this ignored file and can install their default toolchains.

ADB must list the phone with status **device**. **unauthorized** means the phone's approval prompt still needs attention. An empty list means Windows/ADB has not detected it. If the cable and debugging settings are correct, use Samsung's official USB driver linked below.

## Build and install

With the phone authorized:

```powershell
cd mobile
npm.cmd run android -- --device
```

Choose the Samsung phone if asked. Expo builds for its architecture, installs the development app and starts Metro. Keep that terminal running while testing. Use `.cmd` launchers in PowerShell to avoid the blocked `.ps1` launcher issue.

For subsequent JavaScript-only work, in an environment-configured terminal:

```powershell
cd mobile
adb reverse tcp:8081 tcp:8081
$env:NODE_OPTIONS = "$env:NODE_OPTIONS --dns-result-order=ipv4first".Trim()
npx.cmd expo start --dev-client --localhost --max-workers 2
```

Open the installed still. development app and connect to `http://127.0.0.1:8081` if it does not reconnect automatically. USB port forwarding makes the phone's port 8081 reach Metro on the laptop. The forwarding may need repeating after reconnecting USB. On this laptop, Node otherwise bound Metro only to IPv6 `::1`, which the USB connection could not reach. The process-only `NODE_OPTIONS` setting makes Metro bind IPv4 instead. A quick health check is `curl.exe http://127.0.0.1:8081/status`; expect `packager-status:running`.

If the APK is already built, install it without rebuilding (from `mobile/`):

```powershell
adb -d install -r .\android\app\build\outputs\apk\debug\app-debug.apk
adb -d reverse tcp:8081 tcp:8081
```

`-d` targets the USB device, and `-r` updates an existing installation while retaining its app data. This is a development APK: it needs Metro for the JavaScript, and is not the standalone release build.

## First device exercise

Use synthetic moments only:

1. Tap FOMO. The reminder should appear immediately, with a saved timestamp.
2. Open history and confirm the moment exists.
3. Close and reopen the app. Confirm it persists in the native build.
4. Delete the moment and reopen again. Confirm it stays deleted.
5. Change a starter reminder in `mobile/src/journal/emotions.ts`. Observe the update through Metro; compare this with rebuilding the APK.

Persistence alone does not prove encryption. We separately confirmed SQLCipher's runtime version, protected-key presence and rejection of an unkeyed database read on the S20. Backup/restore, missing-key recovery, app unlock and broader failure behavior still require validation before personal journals are appropriate.

## A build issue we discovered

The first real Gradle build rejected `rootProject.name = 'still.'`: Gradle project names cannot end with a period. We changed Expo's `name` to `still` and regenerated Android. The launcher/native project use `still`; the app's own text can keep the `still.` brand. Fix the source configuration (`mobile/app.json`), rather than only editing generated files that prebuild can replace.

The first phone run also exposed a packaging failure: the APK omitted `libcrypto.so`, and Android refused to load SQLite. The native build metadata had an empty `runtimeFiles` list. Using the short Gradle cache path restored both `libcrypto.so` and `libfbjni.so` to that list. We initially suspected a dependency declaration, but the build evidence pointed to the local path issue; no dependency patch is needed.

After building, run `npm.cmd run verify:apk` from `mobile/` with `JAVA_HOME` configured. This checks that each packaged SQLite architecture also includes `libcrypto.so`. It catches the original packaging omission but does not prove that encryption works on the phone.

For repeat configuration updates, use:

```powershell
npx.cmd expo prebuild --platform android --no-install --no-clean
```

SDK 57 recreates native folders by default. `--no-clean` updates an existing valid folder and retains its build files. A deliberate clean regeneration is still appropriate when required by native changes that cannot be applied repeatedly. Rebuild the APK after native configuration changes.

## Keep disk use under control

Check free space before the first build and after adding native dependencies. Build output, downloaded dependencies and the NDK can consume multiple GiB. Keep several GiB free for Windows; stop before the drive fills up.

Keep useful Gradle caches between builds: deleting them every time forces downloads again. Do not run Gradle `clean` routinely. Stop the Gradle daemon when finished to release its memory:

```powershell
cd android
.\gradlew.bat --stop
```

Keep one development build and avoid accumulating APK copies. SDK emulator/system-image removal should be a deliberate SDK Manager operation, since other projects may use them. Cloud builds are an alternative if local build storage becomes impractical; they require an Expo account and upload the build's source archive.

## References

- [Expo local development builds](https://docs.expo.dev/guides/local-app-development/)
- [Expo SDK 57 requirements](https://docs.expo.dev/versions/v57.0.0/)
- [Android hardware-device setup](https://developer.android.com/studio/run/device)
- [Samsung Android USB driver](https://developer.samsung.com/android-usb-driver)
- [Adoptium archive installation](https://adoptium.net/installation/archives/)
