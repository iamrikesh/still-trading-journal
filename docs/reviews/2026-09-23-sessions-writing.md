# Sessions and writing — implementation evidence

## Starting checkpoint

Started from approved design checkpoint `3b3a990`, with the spec/plan committed as `bc3aa1c` on `codex/android-device-setup`. Rikesh requested autonomous completion of all journal features, keeping the phone unlocked; routine design and execution choices are delegated. This review records actual evidence, not anticipated outcomes.

- Fresh baseline: `npm.cmd test` from `mobile` passed **87/87**, no failures. Node's existing experimental SQLite warning remains; these real SQLite fixture tests are not SQLCipher encryption tests.
- Read Expo SDK57 index and SQLite documentation before application changes. Read `mobile/AGENTS.md` and reused the existing S: alias/toolchains.
- Device connected and unlocked; existing Metro returned `packager-status:running`, USB port8081 forwarding present. Opening the existing activity did not reload or start audio.
- Native baseline: audio idle, zero pending operations, empty synthetic cycle moment, **3920423 bytes** usage. Exact **17-file** set recorded in an ignored local metadata file. Earlier four and later seven retained sample duration/byte pairs match the previous checkpoint. No private journal text or audio exported.
- Phone screen timeout was 60000 ms; stay-awake-while-plugged-in setting was 0. Temporarily enabled USB stay-awake (2) to keep the authorized unlocked phone available. Restore 0 at milestone wrap-up; no lock credential or security setting changed.
- All feature acceptance checks remain pending. No claim of implemented sessions, notes or reflections yet. Existing recording and release gates remain open.

## Storage implementation

Committed as `b56e5f2`: schema3 adds sessions, explicit moment association and notes/reflections through the existing serialized encrypted-database owner. Old moment retries retain their original grouping; completed writing rejects stale edits. Migration retains clip key-evidence checks and coordinated deletion.

The implementer's recorded red test failed because `session.trading` was absent. Additional failing tests caught deletion-pending draft discard and finalisation earlier than the latest edit. Initial focused **13/13**, full **100/100** and TypeScript passed. Independent review found legacy-ID compatibility and insufficient post-mutation rollback evidence. Fix `d444d37` preserved arbitrary legacy text IDs, injected migration failure at COMMIT after actual schema/version changes and matched writing indexes to their ordering; focused36/36, full102/102 and TypeScript passed. Fix `8bdeefa` corrected empty legacy-ID owner reconstruction with an explicit NULL check; new regression failed before the fix, then the covering suite passed16/16 and TypeScript passed. Scoped independent review approved all findings. These real SQLite host tests do not establish native encryption behavior.

## S20 storage acceptance (before UI integration)

Cold-started the existing installed APK against the reviewed schema3 implementation. Using the development runtime's actual journal facade, created an explicitly synthetic **Feature test Sep23** session containing **Feature test final note** and **Feature test draft**. No microphone was started.

- Native storage accepted Start, automatic association, draft saves, End and later note finalisation. A completed-note overwrite was rejected. Ungrouping and regrouping preserved the moment. Corrected boundaries produced an adjustment marker. Archive followed by Restore retained the session.
- A second cold restart recovered the ended/adjusted session, two timeline moments, exact synthetic original text, completed session reflection and editable unfinished draft. There was no active session. These are real device persistence/API checks; the new UI was not yet integrated and has not been validated by this probe.
- After restart, the exact original **17-file** clip set and **3920423-byte** usage remained unchanged; all earlier four and later seven sample duration/byte pairs matched. Audio idle, zero pending, empty cycle-test moment. No private text/audio export, data reset, key replacement or APK rebuild.
- The first inspector request immediately after cold activity launch arrived before the JS inspector was ready. A later request completed normally; Android activity-launch timing is not an end-to-end usable-app benchmark.
- Retained the clearly labelled synthetic session, final note/reflection and draft for subsequent UI checks and Lesson7. Existing content was not edited or deleted. USB stay-awake remains temporarily2 pending milestone wrap-up.

## Device acceptance sequence

Use the [implementation plan](../superpowers/plans/2026-09-23-sessions-writing.md), with storage migration and controller tests before the device migration. Cold restart after changing the runtime session facade. Create only clearly labelled synthetic examples; never reset data or remove pre-existing content. Compare the exact initial media set and metadata after testing, distinguishing deliberate synthetic additions.

Record host, Android compilation, real-device UI and native audio outcomes separately. A pending-save simulation is not a physical low-storage test. A stopped audio status alone does not prove every interruption path. Completion of sessions/writing does not complete custom reminders or history/theme.
