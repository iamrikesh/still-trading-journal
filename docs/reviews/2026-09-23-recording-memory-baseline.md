# Longer S20 recording memory baseline — 2026-09-23

## Starting point and method

GitHub was checked directly: `b1a471f` was already published on `codex/android-device-setup`, and the checkout was clean. Continued the open memory investigation from the [resource-cycle review](2026-09-23-recording-resource-cycles.md). App/native source and the installed APK were unchanged. Reused Metro, the S20, existing SDK/toolchains and caches; no rebuild, installation, emulator or heap dump.

The measured run targeted twenty UI Record → Stop → Play → Delete cycles in the empty **Cycle test Sep23** moment, with a 30-second idle pause after each group of five. It completed **sixteen** before a start failure interrupted cycle seventeen; this is not a twenty-cycle pass. Each completed cycle checked the synthetic owner, Recording and Saved states, playback temporary-file creation/removal, clip-deletion confirmation and restoration of the exact initial vault filename set. The same app process remained throughout the measured interval. No Runtime.evaluate, JavaScript inspector connection or forced garbage collection was used during that interval.

Resource snapshots use Android `dumpsys meminfo` and counts of the app process's descriptors/threads. In addition to PSS/RSS, the detailed Native Heap row supplies Heap Size, Alloc and Free. PSS and heap-allocation fields are sampled with consecutive commands, not one atomic snapshot. These counters cover the whole development app, not just audio objects. UI inspection and development tooling remain part of this environment; this is not a release benchmark.

An initial attempt completed one cycle, then UIAutomator exited with status **137** during observation of the next capture. The helper sent Home. That attempt is excluded from the twenty-cycle run. Reopening the app found a saved **1231 ms / 10974-byte** test clip and zero pending operations; only that clip was deleted. The available app-exit history showed the deliberate force-stop, not a new app crash. Exit 137 alone does not establish why the UI command was killed.

The ignored helper now retries that specific read-only UI-inspection failure at most three times, discarding its old XML before each attempt. It still stops the run on an unverified state or exhausted retries. A fresh process was started before the measured rerun. No speculative app-code fix was made.

## Measured results

Sixteen full cycles restored the original **15-file vault set**, with no leftover staging/playback plaintext. The run ended at **595.8 seconds** (about 9m56s), including the three 30-second idle pauses and the failed attempt at cycle seventeen. The baseline and comparable idle snapshots are below; all memory values are KiB.

| Checkpoint | Total PSS | Native-heap PSS | Native allocated | Native heap free | Descriptors | Threads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cold-run baseline | 285974 | 101416 | 99562 | 9014 | 162 | 50 |
| 30 s idle after cycle 5 | 318305 | 117468 | 115244 | 11693 | 161 | 49 |
| 30 s idle after cycle 10 | 325350 | 118176 | 113417 | 22622 | 160 | 49 |
| 30 s idle after cycle 15 | 329637 | 123716 | 114609 | 22222 | 161 | 50 |
| After cycle 16, before idle | 340673 | 128400 | 119969 | 19737 | 161 | 50 |

Native allocation fell from **121092 to 105438 KiB** between cycles seven/eight and from **119024 to 110748 KiB** between cycles twelve/thirteen, without restarting the app or forcing collection. The three post-warm-up idle allocations were **110.8–112.5 MiB**; file descriptors ranged from **160–162** and threads from **47–51** across completed-cycle snapshots. This is evidence of allocation release and a bounded range at those three idle checkpoints, not proof of indefinite stability or identification of the allocation/collection mechanism. Total PSS and native heap size remained above startup levels.

## Interrupted seventeenth cycle

The helper could not find an enabled Stop button. Its retained fresh UI hierarchy instead showed **“Recording could not start. Check microphone access and free space. Any pending clip can be retried or discarded.”** on the synthetic cycle moment. The helper's broad `Recording ` prefix check could match this error; it has now been tightened to the full recording-timer pattern. That helper fix does not explain or fix the app's start failure. The earlier sixteen cycles also required Stop, Saved, playback temporary creation and successful deletion, so they are not counted from that prefix alone.

The fallback sent Home. Follow-up verified the app process was unchanged, and the vault still had the original **15 files, zero staging files, zero playback files and zero pending ciphertext files**. This filesystem result does **not** establish zero pending database intents. The phone was Dozing/locked by the subsequent inspection; its power state at the exact failed-start instant was not captured. Do not infer that screen lock caused the failure. Scoped recorder/runtime logs did not return a diagnostic cause.

Opening the activity did not bypass the lock, and the development inspector was unavailable. Rikesh was asked to unlock the S20. At this checkpoint, foreground recovery/pending state is still unverified. No app data was cleared and no unknown pending intent was discarded.

Later read-only checks confirmed the active user's microphone grant, an allowed RECORD_AUDIO app-op with foreground UID mode, and **1008432 KiB available on /data**. This is above the native 100 MiB admission threshold; it is a later snapshot, not proof of free space or focus at the failed-start instant. Metro remained healthy and USB forwarding was present.

## Unlock and recovery follow-up

After Rikesh unlocked the S20, the existing activity showed **one pending clip operation** in **Cycle test Sep23**, with Record disabled. The vault still contained 15 files and no plaintext or pending ciphertext. **Retry save** retained the pending operation and showed “Audio could not complete.” After verifying the synthetic owner, **Discard → DISCARD** removed that failed intent: the moment became empty and Record enabled again. No earlier sample was selected or deleted.

This distinguishes a durable database intent from captured audio. Current `journalSession.ts` persists `core.begin(snapshot)` before calling native `startCapture`; a failed start can therefore leave a pending intent without an audio file. This explains the recoverable state, but does not identify which native check or operation rejected the seventeenth start. The later lock, granted permission and available-space readings do not establish its cause.

Metro was running, but its inspector target list was empty while the app UI remained usable. Recovery used the normal UI before any reload. The follow-up cycle helper was also tightened to require the exact recording timer, rather than matching the start-error prefix.

**Five separate follow-up cycles passed**, each observing Record/Stop/Saved/Play/Delete and restoring the exact original vault filename set. No JavaScript inspection occurred during these five cycles. The app process matched the earlier run before and after this segment; no restart was needed to recover recording. A mid-segment snapshot showed the phone awake with the app window focused. The start failure did not recur. These five cycles are not a continuous twenty-cycle pass and do not establish a root cause.

For context, this segment's baseline/final total PSS was **330083/335480 KiB**, and native-heap PSS was **120476/128992 KiB**. Sampled descriptors ranged 160–161 and threads 51–53 including baseline. There were no fixed idle checkpoints or detailed allocated-heap readings in this recovery segment; it should not be compared directly to the earlier idle allocation table as a plateau test.

A subsequent cold restart restored the inspector target. Fresh checks confirmed **native audio idle, zero pending operations, zero cycle-test clips, 3896667-byte usage**, and the original duration/byte pairs for all **four earlier plus seven September23 lifecycle samples**. Final vault inspection found 15 files, no plaintext temporaries and no pending ciphertext. The empty synthetic panel was reopened and the two owned temporary UI dumps removed. App data was not reset; earlier samples, permissions and sleep settings were preserved. No audio was exported.

## Resume and learning

Recovery is complete for this failed synthetic intent. Resume by checking the branch and environment, then open the empty **Cycle test Sep23** moment. Investigate the failed-start boundary with correlated foreground/focus/power/admission evidence before proposing an app fix; the generic native error does not reveal which check failed. Preserve all earlier samples. Any new measurement is a separate segment, not completion of an uninterrupted twenty-cycle run.

Use the previous resource review's ADB procedure, adding full `dumpsys meminfo` for the Native Heap Size/Alloc/Free fields. Keep the same process, check actual timer text, and use fixed idle intervals. Do not use JavaScript inspection inside the measured interval.

Exercise: native allocated memory fell by 15654 KiB between cycles seven/eight, while total PSS fell by only 6731 KiB. Why should those counters not be expected to move together? Explain why the failed start still needs investigation even though the completed-cycle memory readings improved our evidence.

No app source, host tests or native build changed. Earlier host/native checks remain dated evidence, not new runs. Calls/headphones were still unavailable; permission-dialog interaction, device fault/low-space checks and release gates remain open. The measured run does not establish production readiness or leak freedom.
