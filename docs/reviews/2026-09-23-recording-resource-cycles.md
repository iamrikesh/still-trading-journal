# S20 recording resource cycles — 2026-09-23

## Scope

Continued clean `codex/android-device-setup` at `cb0f426`. Rikesh said neither a call nor headphones was available, so those interruption checks remain open. Ran ten bounded UI Record → Stop → Play → Delete cycles in a new synthetic **Cycle test Sep23** moment. No app/native source, dependencies, APK or phone settings changed; existing Metro and the installed S20 development build were reused.

The prior [lifecycle review](2026-09-23-recording-device-checks.md) records the earlier denial, immediate-Stop, lock and cold-restart evidence. Its 81 host tests and TypeScript checks belong to that earlier validation; they were not rerun for this documentation-only increment. No new native test/build evidence is claimed.

Local automation checked the synthetic moment's heading before every app tap and the clip-deletion dialog before confirming. It required an empty test moment before beginning, then exactly one owned saved clip per cycle. It inspected only controls, numeric clip/resource metadata and vault filenames; no audio, journal prose or keys were exported. Scripts and raw diagnostic files remain local and ignored.

## Ten completed device cycles

Every cycle observed actual native recording, a saved clip, native playback and a temporary playback plaintext file. Playback either completed naturally or was stopped through the visible Stop control. Afterward, native audio was stopped and playback plaintext was absent. Deleting that cycle's clip through UI confirmation restored **zero test clips, zero pending operations, 3896667 bytes of vault usage and the exact original 15-file set** (14 ciphertext files and the protected keyset). No earlier clip was deleted or replaced.

UI inspection takes time, so these recordings varied from 3158 to 8150 ms; this is not a precisely timed throughput benchmark. The table contains snapshots after each cycle's cleanup, in KiB as reported by Android. Native heap below is the summary's PSS contribution, not its live allocated-byte total. Descriptor counts include development/inspection connections.

| Checkpoint | Clip duration (ms) | Total PSS (KiB) | Native heap PSS (KiB) | Open file descriptors | Threads |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | — | 321246 | 117316 | 162 | 47 |
| Cycle 1 | 3158 | 322242 | 120484 | 162 | 50 |
| Cycle 2 | 8150 | 330749 | 124204 | 160 | 48 |
| Cycle 3 | 5201 | 334021 | 126696 | 162 | 48 |
| Cycle 4 | 4296 | 339553 | 130852 | 162 | 48 |
| Cycle 5 | 8127 | 345269 | 133624 | 162 | 48 |
| Cycle 6 | 6083 | 350946 | 137012 | 161 | 49 |
| Cycle 7 | 7105 | 339634 | 124916 | 161 | 49 |
| Cycle 8 | 7128 | 343698 | 128528 | 161 | 49 |
| Cycle 9 | 7151 | 345423 | 130832 | 160 | 49 |
| Cycle 10 | 7105 | 349599 | 133780 | 160 | 49 |

All ten cycles completed without a failed assertion. No monotonically growing file-descriptor/thread count or durable-file accumulation was observed. Total PSS ended 28353 KiB (about 27.7 MiB) above baseline, but dropped by 11312 KiB between cycles six and seven. These numbers do **not** identify a leak, its cause, or a safe long-term memory ceiling.

Source inspection confirmed explicit release paths for recorder, player, metadata retriever and directory-sync descriptors. That inspection is not evidence that every runtime allocation is reclaimed. No speculative source fix was made.

## Measurement controls

After an additional 30 seconds without app actions, PSS was 341307 KiB, native-heap PSS 131616 KiB, 160 descriptors and 47 threads. This was lower than cycle ten but above the original baseline.

Five control blocks performed six UI hierarchy reads and five JavaScript status inspections each, with **no Record/Play/Delete actions**. Every status check found an empty cycle-test moment, zero pending operations and stopped audio. Total PSS nevertheless went from 339479 to 383237 KiB and native-heap PSS from 131616 to 173480 KiB. Descriptors stayed at 160; thread samples ranged from 47 to 50.

Further isolated controls:

| Action, with no recording/playback | PSS before → after (KiB) | Native-heap PSS before → after (KiB) |
| --- | --- | --- |
| Ten status inspections, separate inspector connections | 382029 → 399957 | 173464 → 191168 |
| Ten UI hierarchy inspections, no JavaScript inspection | 399369 → 401541 | 191168 → 191172 |
| Ten status inspections over one inspector connection | 400313 → 417285 | 191168 → 208528 |
| Ten debugger evaluations of only `1 + 1` | 417753 → 422237 | 208512 → 214032 |

The arithmetic control calls neither the app's audio nor storage methods. It establishes a measurement confound in this debug/inspector environment; changing connections alone did not remove it. It does not identify the underlying allocation owner or prove an upstream leak. The original memory slope cannot be attributed to voice recording alone. No debugger heap dump was taken, because it could contain private state.

## Comparison without JavaScript inspection

Cold-restarted the app and attempted five UI-only cycles, collecting memory via ADB and inspecting vault filenames without Runtime.evaluate during the run. Two cycles completed, from a baseline of 288873 KiB total / 103256 KiB native-heap PSS to 310118 / 111552 KiB. During cycle three, UIAutomator reported a null root node and the expected Playing text was not observed. The helper sent Home on failure. That attempt is **not** a five-cycle pass. Follow-up found a saved 9102 ms / 75564-byte test clip and zero pending work. Android's recent process-exit history contained the deliberate force-stop, not a new crash entry; the scoped runtime-error query was empty. These bounded observations do not establish why UI inspection failed.

Reopened the app and deleted only the interrupted cycle's clip. Changed the ignored helper to delete its own old UI dump and retry a missing fresh hierarchy, so stale XML cannot count as an observation. The rerun checks the temporary playback file immediately after Play; playback may complete naturally before the next UI snapshot. No app code changed. The following **five-cycle rerun completed**, with no JavaScript inspection between its baseline and final measurement:

| Checkpoint | Total PSS (KiB) | Native-heap PSS (KiB) | Descriptors | Threads |
| --- | ---: | ---: | ---: | ---: |
| Rerun baseline | 311059 | 115544 | 165 | 51 |
| Cycle 1 | 318466 | 119756 | 165 | 52 |
| Cycle 2 | 320310 | 119732 | 165 | 52 |
| Cycle 3 | 324474 | 121336 | 165 | 52 |
| Cycle 4 | 330334 | 124052 | 165 | 52 |
| Cycle 5 | 337394 | 128556 | 165 | 51 |

Each rerun cycle showed Recording and Saved, requested Play, observed its playback temporary, then verified that plaintext was removed and UI deletion restored the exact baseline file set. The rerun's PSS still rose 26335 KiB (about 25.7 MiB), with 13012 KiB of native-heap PSS increase. **Debugger overhead is one confound, not a complete explanation of memory growth.** Longer controlled profiling remains open; these short runs cannot certify a memory plateau or leak freedom.

After a further 30 seconds without app actions, PSS was **331432 KiB**, native-heap PSS **126900 KiB**, with **164 descriptors / 51 threads**. Memory was still above the rerun baseline. A final metadata query, outside the measured interval, confirmed zero cycle clips/pending operations and the original usage. A cold restart then confirmed native **idle**, cycle clips **0**, pending **0**, usage **3896667 bytes**, and exact duration/byte matches for all four earlier plus seven lifecycle samples. The empty cycle-test moment is retained. Owned UI dumps were removed. Metro/USB forwarding remain running; no audio is active. Laptop free disk was 10.64 GiB (whole-drive reading).

## Reproduction and learning

Use Lesson2's existing S20/Metro setup and a dedicated synthetic moment with no clips. Preserve all earlier samples. Record for a few seconds, Stop and wait for Saved, Play, wait for completion or Stop, then Delete only that clip and confirm. Repeat ten times. Compare the same starting/ending vault filename set and pending state; do not clear app data.

For memory snapshots use `adb -d shell dumpsys meminfo -s com.iamrikesh.stilljournal`. Obtain the current process with `adb -d shell pidof com.iamrikesh.stilljournal`; use `run-as` to count entries in `/proc/<pid>/fd` and `/proc/<pid>/task`. Read only filenames in `no_backup/still-clips-v1`. Avoid debugger evaluation during the measured interval; record cold/warm state, clip duration, device state and idle intervals. A stale or unavailable UI snapshot is a failed observation, not a passed app check. The ignored local helpers are laptop conveniences, not required repository tooling.

Exercise: why does restoration of the exact original files prove cleanup more directly than a single higher PSS reading proves a memory leak? Identify which conclusion the arithmetic-only control supports, and which conclusion it cannot support.

Calls/headphone disconnection remain untested because neither was available. Device low-space/save-fault checks, deliberate Deny-button interaction, startup edges and longer memory profiling remain open, along with the previously documented release gates. No production-readiness claim follows from this run.
