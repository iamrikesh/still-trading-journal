# Cancel recording starts across background transitions — 2026-09-23

## Reproduced behavior

Continued from `b1a9c79` on `codex/android-device-setup`. In the synthetic **Cycle test Sep23** moment, pressing Record and immediately sending Home could start capture **after returning**, without another Record press. This is a separate reproduced defect; it does not establish the cause of the earlier memory-run cycle17 start failure.

The old implementation reproduced this twice. In the five-second-away probe, the app window was no longer focused, the vault had its original 15 files with no plaintext, and Android's microphone app-op reported only an older completed operation. After reopening the existing activity, the recording timer and Stop control appeared, a staging file existed, and the microphone app-op was running. Explicit Stop saved the synthetic clip. Both generated clips were deleted with confirmation; prior samples were preserved. Host-side command timing is approximate and does not timestamp individual native lifecycle callbacks.

Source inspection found that `createRecordingController.background()` returned immediately during its `permission` phase, without invalidating the request. A deterministic host probe held permission unresolved, called background and foreground, then resolved permission: the old controller started capture. The existing fourteen controller/session tests passed before new coverage was added, so they did not cover this case.

## Change and verification

The controller now invalidates pending work on every background transition. Returning to the foreground cannot restore the old request's epoch. Native foreground admission remains in place, but it cannot substitute for cancelling an earlier request: a stale request can arrive after the app is foreground again.

The runtime first checks the current microphone grant, requesting permission only when needed. This follows the [Expo SDK57 Audio permission API](https://docs.expo.dev/versions/v57.0.0/sdk/audio/#audiogetrecordingpermissionsasync). The installed Expo Android permission service delegates permission requests to the activity. On this S20, always requesting an existing grant caused the tightened controller to cancel ordinary Record presses; the grant query avoids that unnecessary request. A cold restart was used after the adapter change because Fast Refresh can retain the controller's original permission callback through `useState`.

- **Red/green:** two new controller cases failed on the old code because a clip was created after leaving during permission. Both pass with cancellation, covering permission resolution while still away and after returning. Each also checks that a fresh explicit Record/Stop can save.
- **Host:** all **83 tests** and TypeScript passed on the final source. The runtime's native permission behavior is covered by the device checks below, not by the controller's mocked permission port.
- **Review:** independent read-only review found no issues in the controller/tests or the runtime addition; the reviewer also ran the twelve controller tests successfully.
- **S20 ordinary recording:** after a cold restart with the final adapter, one Record/Stop/Play/Delete cycle passed and restored the exact original vault filenames.
- **S20 rapid leave/return:** the final implementation's five-second-away probe showed a completed **121 ms microphone app-op**, an incomplete staging file, and no running microphone operation after return. No timer or Stop control reappeared. The pending synthetic clip was explicitly discarded. The 121 ms value is an Android operation duration, not a validated saved clip duration.
- **Actual permission dialog:** microphone permission was temporarily revoked and its user decision flags reset to exercise the prompt. Tapping **While using the app** restored access but left native audio idle, zero pending and no cycle-test clip. This is the intended conservative behavior when the permission flow backgrounds the app: press Record again to start.
- **Fresh Record after grant:** another Record/Stop/Play/Delete cycle passed and restored the original file set.
- **Final cold restart:** native audio idle, zero pending, empty cycle-test moment, 3896667-byte usage, and all eleven retained sample duration/byte pairs unchanged. The vault had 15 files, no plaintext or pending ciphertext. Microphone access and the original USER_SET/sensitivity flags were restored; phone sleep settings were unchanged. Owned UI dumps were removed; the app was left stopped on Now.

The controller-only intermediate build also passed one- and five-second leave/return probes, but cancelled normal Record requests. Those probes are not substituted for the final adapter's device results.

No native source, dependencies or APK changed; the installed S20 development build and existing Metro/toolchains were reused. No audio, journal prose, keys or local diagnostic files are included in the repository. This is not a release-readiness or long-run memory claim.

## Learning and remaining work

### Actual Deny and permission-navigation follow-up

Continued from published `2a4cda4` with unchanged app/native source. The starting device vault now contained **17 files / 3920423 bytes**, including additional saved audio since the previous checkpoint. This current baseline was preserved; it was not reduced to the older 15-file baseline. The Deny check ran on an existing saved moment without capture; the named empty **Cycle test Sep23** panel was explicitly verified before new recording tests.

- **Actual Deny:** tapped Android's permission-controller Deny button by its resource ID. The active user's microphone grant became false, native audio stayed idle, pending stayed zero and vault usage was unchanged. **Feedback failed:** no denial explanation appeared in the app.
- **Leave during the prompt:** opened a fresh permission prompt, sent Home while it was displayed, verified launcher focus and no running microphone app-op, then reopened the existing activity. The prompt was dismissed; the synthetic moment stayed empty with native audio idle and zero pending. No Record press was issued on returning. This validates Home/return, not every navigation route or permission-dialog variant.
- **Restore and record:** a fresh Record opened the permission prompt again. Tapping **While using the app** restored access while leaving audio idle. A subsequent explicit Record/Stop/Play/Delete cycle passed and restored the exact initial vault file set.
- **Final cold restart:** audio idle, zero pending, empty synthetic moment, **3920423-byte usage** and the exact original **17-file set**. All eleven earlier retained sample duration/byte pairs also matched. Microphone grant and USER_SET/sensitivity flags were restored. Owned UI dumps were removed; app left stopped on Now. No journal/audio export or app-data reset.

An ignored deterministic host probe reproduced the feedback gap: permission pending → background → foreground → denied produced `phase=ready`, zero starts, zero pending and `message=null`; the assertion requiring a denial explanation failed. In `controller.ts`, the stale-request/foreground guard returns before the existing denial-message branch. Cancellation is working; denial feedback is suppressed by that ordering. This is a recorded failing check, not a passing regression or a completed fix. No app code was changed for this follow-up, and the full 83-test/TypeScript results above remain the prior implementation's validation.

**Exercise:** why is “the app is foreground now” insufficient to authorize a Record request made before leaving? Explain how invalidating the earlier request differs from checking current foreground state.

The feedback gap was fixed in the increment below. The original cycle17 failed-start cause remains unproven. Calls/headphone changes, additional navigation variants, device low-space/save faults and existing release gates remain open. Repeat future interruption tests with disposable samples and verify both native state and pending work before continuing.

### Denial feedback fix

Continued from `a817b41`. The controller now processes a denial before the stale-recording guard, but publishes its explanation only if the original selection is still current. A separate selection counter advances on every `select`, including selecting another moment and returning to the original. Backgrounding still invalidates capture through the existing operation counter. Showing a denial message cannot start recording; granted results remain subject to the unchanged cancellation/foreground checks.

Four regressions cover denial resolution before/after returning and suppression after switching moments, including A → B → A. The two denial-feedback cases failed against the old source with `message=null`; final **87/87 host tests** and TypeScript passed. Independent review found no issues and separately passed all **16 controller tests**.

On the S20, the actual Deny button now displayed **“Microphone permission was not granted. Your moment is saved; you can allow access in Android Settings.”** Native audio was idle, the synthetic moment empty, pending zero and usage unchanged. Home while a fresh permission prompt was open, then returning, also left audio idle and showed the explanation. A fresh permission grant left capture stopped. All new recording work used the explicitly verified **Cycle test Sep23** panel. The existing installed APK and toolchains were reused; native/runtime source and dependencies were unchanged.

A fresh explicit Record/Stop saved **14024 ms / 115942 encoded bytes**. The cycle helper then aborted because its first Play attempt did not observe a playback temporary; its fallback sent Home. Follow-up found the sample saved, zero pending and native stopped with a 110 ms status duration. That status is not proof of why playback stopped. Replaying the same sample showed **Playing 0:02**, native `playing` at 4323 ms, and a playback temporary file. By the next explicit Stop attempt the enabled Stop control was absent; no tap occurred. Confirmed deletion of only this synthetic sample restored the baseline. This is a successful save and observed replay, not an uninterrupted automatic cycle pass; the initial brief playback stop remains unclassified.

Final cold restart confirmed native audio idle, zero pending, no cycle-test clips, **3920423-byte usage** and the exact starting **17-file set**, with no plaintext or pending ciphertext. All eleven earlier sample duration/byte pairs matched. Microphone access and its original USER_SET/sensitivity flags were restored. Sleep settings were unchanged, app data was not reset, and owned UI dumps were removed. The app was left stopped on Now. Local helpers/diagnostics remain ignored.

**Exercise:** why does backgrounding invalidate a recording request while leaving its denial explanation useful? Why must selecting A → B → A invalidate that old explanation even though the final moment ID matches?
