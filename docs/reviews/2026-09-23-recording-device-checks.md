# S20 recording lifecycle checks — 2026-09-23

## Scope and baseline

Resumed clean `codex/android-device-setup` at `2252f5a`, verified directly against GitHub before work. Reused the installed development APK, dependencies, Android SDK, S: checkout alias and caches. Started Metro with IPv4 preference and two workers and restored USB forwarding. No source fix, dependency change, native test run, APK build or emulator was required.

Rikesh explicitly confirmed the phone was unlocked and ready for microphone tests with private conversation out of earshot. Created a separate synthetic **Voice test Sep23** moment through the existing journal facade. Existing journal rows, keys and media were retained. Diagnostics used controls, sample clip metadata and filenames; no audio was copied or transcribed. Local helpers and raw device diagnostics remain ignored.

Fresh host checks: **81 tests passed, zero failed**, `npm.cmd run typecheck` passed. These are host tests, not physical microphone proof. The previous 62 native tests/build remain September22 evidence only.

At entry, native audio was idle and there were zero pending operations. Vault usage was **2571565 bytes**, not the older handoff's 2474347-byte total. The old sample moment contained four saved clips with duration/encoded-byte pairs **4179/35139**, **239527/1965396**, **9613/79721**, **47111/387262**. The extra four-second clip was pre-existing and was preserved. Other pre-existing files were not read or deleted.

## Device observations

| Check | Observed outcome | Scope / limit |
| --- | --- | --- |
| Android-enforced microphone denial | After revoking RECORD_AUDIO and setting user-set/user-fixed, Record displayed the microphone-denied message. Native audio stayed idle; the two already-created Sep23 clips remained; zero pending operations and no new clip. | Actual Android denied state, not a successful tap on the Deny dialog. Two earlier prompt attempts received grants before automated denial could run; their clips were stopped and retained. |
| Restore permission | Cleared the temporary user-fixed flag and granted RECORD_AUDIO. Read-back matched the original grant with USER_SET and Android sensitivity flags. | No data reset. A separate false entry in package output is not the active user's runtime grant. |
| Immediate Stop / repeated taps, first valid run | A four-tap sequence (Record, another Record-area tap, Stop, Stop) with a 700 ms pause after the first tap took **1.029 s**. Exactly one new clip saved: **488 ms / 5039 bytes**. Native stopped duration was 626 ms; zero pending operations. | Second Record-area tap targets the disabled Record control; does not claim two simultaneous delivered JS events. Input timing is not a universal timing guarantee. |
| Immediate Stop / repeated taps, second valid run | Same sequence took **1.040 s**. Exactly one new clip saved: **534 ms / 5418 bytes**. Native stopped duration was 651 ms; zero pending operations. | Two bounded device repetitions, not a resource soak test. |
| Deliberate screen lock | Started a sample, sent KEYCODE_SLEEP, then read Android power state after one second: **Dozing**. Native stopped at 3715 ms and saved **3576 ms / 30235 bytes**, zero pending. After Rikesh unlocked the phone, native remained stopped, duration unchanged and Record was available. | No automatic restart. Tests this S20 development build; does not prove call/headphone behavior. |
| Cold restart | Force-stopped only still. and reopened the development client. All seven Sep23 clips had the same saved durations/bytes; old sample moment retained all four baseline pairs. Native **idle**, pending **0**, vault usage **3896667 bytes**. | Existing Metro served the app; not a standalone release launch. No fresh listening/intelligibility assessment. |

The first rapid-tap attempt lasted 0.328 s and sent Stop coordinates before the Stop control appeared. It did not stop the recorder and is **not counted** as an immediate-Stop pass or proof of a dropped visible Stop event. A subsequent tap on the verified visible Stop control saved that 18204 ms clip. No fix was made from this invalid timing attempt. Cancellation during the UI's Preparing phase remains a separate UX consideration.

An earlier screen-off attempt saved an 11029 ms clip, but the phone was already Awake at the follow-up power check. The repeated test above supplies the directly observed Dozing evidence. Immediately after the earlier screen-off command, an inspector read still showed recording; the next read showed stopped/saved. The evidence does not claim synchronous stopping at the exact input-command boundary.

## Retained samples and cleanup

All seven Sep23 clips remain for learning. Listed in creation order:

| Purpose | Duration (ms) | Encoded bytes |
| --- | ---: | ---: |
| First granted prompt attempt | 93131 | 764760 |
| Second granted prompt attempt | 33110 | 272492 |
| First screen-off attempt | 11029 | 91395 |
| Too-early tap sequence, then visible Stop | 18204 | 150251 |
| First valid immediate Stop | 488 | 5039 |
| Second valid immediate Stop | 534 | 5418 |
| Dozing-confirmed screen lock | 3576 | 30235 |

Filename-only inspection of the durable clip directory found ciphertext files and the protected keyset, with **no staging/verification/playback plaintext or pending ciphertext**. Microphone permission was restored. Phone sleep settings were not changed. Final laptop reading was **10.81 GiB free**; this whole-drive figure is not attributable to this test. No build/cache copy was created.

Metro and USB forwarding are left running for learning. The app is open on today's sample panel with no recording active. Resume from [PROJECT-STATUS](../PROJECT-STATUS.md); do not duplicate Metro if its health endpoint is already running.

## Remaining checks and exercise

Next: coordinate an actual call/headphone change with Rikesh. Still unrun: deliberate Deny-button interaction, permission-dialog navigation on device, repeated-cycle memory/resource measurement, device low-space/save-fault recovery and startup interruption edge cases. App unlock, backup/export/restore, missing-key UX and release signing/privacy/permission/backup gates remain. This is development-device evidence, not production readiness.

Exercise: use [Lesson6](../learning/06-recording-lifecycle.md) to explain why the two saved sub-second clips display **0:00**, and why a stopped microphone does not alone prove an encrypted save. Predict that unlocking must not resume the newest screen-lock clip; its saved duration remains 3576 ms.
