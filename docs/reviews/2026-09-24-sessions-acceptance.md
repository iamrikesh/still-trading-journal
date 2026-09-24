# Sessions and writing — S20 acceptance follow-up

Continued from `eb2d650` on `codex/android-device-setup`. Tasks 1/2 were implemented and reviewed; this increment resumes Task 3. This report distinguishes UI actions, read-only runtime checks and host evidence.

## Baseline and environment

- Reused the installed development APK, existing dependencies and SDK. Restored the S: alias, USB 8081 forwarding and offline Metro with IPv4 preference and two workers. No rebuild or data reset.
- The connected S20's current settings were stay-awake 0 and screen timeout 600000 ms; the timeout differs from yesterday's record and was preserved.
- The actual 17-file media set matched the previous baseline exactly. Usage was 3920423 bytes, audio idle and pending operations zero. All eleven earlier sample duration/byte pairs matched. No journal prose or audio was exported; ignored local diagnostics contain only controlled synthetic writing and metadata.
- Fresh baseline host checks: `npm.cmd test` passed 123/123, `npm.cmd run typecheck` exit 0. These are not SQLCipher/device-encryption tests.
- Rikesh explicitly confirmed the phone was safe for a brief test recording. Device audio acceptance is recorded separately below when exercised.

## UI evidence

- Started **Feature test Sep24**, cold-restarted, observed the same open session with Resume/End and pressed Resume.
- Created a Note moment. Empty Done displayed **Add some text before Done.** Entered **Feature test Sep24 recovered draft.**, observed Saved draft, cold-restarted, reopened through the session timeline and recovered the editable draft.
- Ended the session while its original note was still a draft, then pressed Done. The exact synthetic text displayed Finalised; the editor and Done control were absent.
- Read-only runtime inspection confirmed moment capture `2026-09-24T05:19:28.042Z`, session End `2026-09-24T05:21:53.529Z`, and note finalisation `2026-09-24T05:21:59.467Z`. These are three separate persisted facts, with finalisation after End.
- Added and finalised a distinct moment reflection. Adding this first list item exposed the rendering defect below.
- Added and finalised a whole-session reflection. For a second, explicitly disposable session-reflection draft, Keep retained the editor and Saved draft; confirmed Discard removed it. Final inspection retained only the intended completed reflections.
- A later session-reflection draft survived another cold restart with exact text **Feature test Sep24 later follow-up.** Verified the editable field contents before Done, then its Finalised/read-only display afterward. The earlier finished reflection remained unchanged.
- Reversed boundaries displayed **Enter valid times; End must be on or after Start.** Saved a valid UTC cross-midnight correction, from `2026-09-23T23:55:00.000Z` to `2026-09-24T05:22:00.000Z`. Adjusted appeared; original Start/End remained stored. Archived the session, opened it in Archived sessions, restored it and verified it in Current sessions.
- Ungrouped the Note moment and observed **Grouped in: Outside session**. Moved it to **Feature test Sep24 audio**, then back to **Feature test Sep24**. Read-only runtime checks confirmed unchanged moment ID/capture time, note and moment reflection. The whole-session reflection stayed with its original session. Corrected boundaries did not change membership automatically.

## Reflection list defect

The S20 showed React Native's full-screen development LogBox: **Each child in a list should have a unique key prop**, identifying `WritingPanel`. Its mapped reflection buttons lacked keys. The fix supplies each writing's stable ID to its Pressable; timestamps/display labels are not identities. Two lines changed, with no storage or native changes.

After the fix, host tests passed 123/123, TypeScript exited 0 and the diff whitespace check passed. Android Metro export passed (685 modules). A source-mirroring test was not added for this small render change; the reproduced device symptom is the pre-fix evidence. Cold-restarted, opened the persisted reflection list, created a second reflection, restarted again, recovered it and finalised it. Navigation and read-only text remained visible without the prior LogBox. Root reviewed the stable-ID diff.

## End during recording and preservation

- With Rikesh's safe-recording confirmation, explicitly pressed Record on the sole synthetic moment while **Feature test Sep24 audio** was active. Observed the running timer, then pressed global End session. UI displayed **Clip saved on this device.** and the session banner disappeared.
- Actual saved clip: 14117 ms / 116712 bytes. The ended session had no active successor, native status was stopped and pending operations zero. This establishes the normal capture-to-End path, not every delayed-release or save-failure branch.
- Moved the moment back with this clip still attached; inspection confirmed the same clip/moment identities. Explicitly confirmed deletion of that sole disposable clip. UI displayed **No clips on this page.**
- Final comparison after cold restart: native idle, zero pending, original 3920423-byte usage, exact original 17-file set, eleven original duration/byte pairs preserved, synthetic clip absent. Retained two clearly labelled ended Sep24 sessions; the first has the Note, completed moment reflection and two completed session reflections, the second is empty. Sep23 examples are unchanged. The latest follow-up was finalised after this last restart; earlier original/reflection persistence and its draft recovery were separately checked.
- Owned phone UI dumps removed. Metro and USB forwarding remain available for the next planned increment. Stay-awake and screen-timeout settings were not changed. No private journal/media export, key replacement, app-data reset or native rebuild.

## Coverage limits and next increment

Sessions/writing Task3's bounded acceptance is complete with these explicit limits: delayed permission resolution after End, unconfirmed release, End database failure and writing save/retry races retain host fault-test evidence only. Physical low-space, real call/headphone interruptions and previous recording resource investigations remain open. Ordinary successful saves do not establish device fault recovery.

Continue the approved reminders/history plan. Custom emotions, reminder media, general older-history paging and persisted appearance are still unimplemented at this checkpoint. The broader journal milestone and release gates remain incomplete.
