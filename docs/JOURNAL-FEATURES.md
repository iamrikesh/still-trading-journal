# Journal features milestone — item 2

Started 2026-09-23 from `a873ab2` on `codex/android-device-setup`, at Rikesh's request to continue through the remaining journal features. This file tracks the whole milestone across design rounds and implementation increments. `PROJECT-STATUS.md` remains the entry point for the latest verified checkpoint.

## Working agreement

- Latest steering: stop at the nearest logical checkpoint after the interruption, update/commit/push progress and resume next session. This supersedes continuing through the full milestone in this sitting; the four-deliverable objective is retained.
- Continue toward all four deliverables below, with progress updates and durable handoffs between increments.
- Use brainstorming and grilling to resolve product decisions; look up technical facts in the repository rather than asking Rikesh to supply them.
- Record decisions as they are answered. Present concrete designs for review before implementation, then use plans, meaningful regression tests, code review and S20 verification.
- Explain one core concept and give a small exercise with each demonstrable increment.
- Commit and push verified milestones. Preserve existing device journals/media and reuse the physical S20, short-path toolchains and caches.
- Existing recording investigations and release gates stay visible, but do not replace this requested feature milestone. No release-readiness claim is implied by finishing item 2.

## Deliverables and completion evidence

| Increment | Scope | Required demonstration | State |
| --- | --- | --- | --- |
| 1 | Trading sessions and timelines | Start/end a session; attach and review its moments; restart without losing state; agreed handling of moments outside sessions | Implemented/reviewed; bounded S20 check passed; broader acceptance next |
| 2 | Typed notes and separate reflections | Capture text without mandatory recording; preserve drafts as agreed; distinguish original capture from later reflection; verify restart and failure behavior | Implemented/reviewed; bounded S20 check passed; broader acceptance next |
| 3 | Custom emotions and personal reminders | Customize emotion buttons; edit support text; add/play personal audio and images; preserve historical captures under later edits; validate and clean up media | Queued |
| 4 | Older history and theme preferences | Browse beyond the recent-history limit with bounded loading; retain chosen theme after restart; verify empty/end/error states and readable presentation | Queued |

These are milestone-level outcomes, not approved detailed designs. Each increment gets a focused spec and plan once its decisions are settled. Completion requires implementation, appropriate automated checks, device evidence and updated documentation; a prototype or passing host suite alone is insufficient.

## Settled constraints from the existing scope

- Android first, offline journal; no account/cloud dependency for capture.
- An emotion tap immediately shows support and saves its own timestamped moment without requiring a note or recording.
- Personal reminder media and captured journal voice clips are different uses.
- Later reflection remains distinguishable from the original moment.
- Foreground-only recording, explicit playback, encrypted persistence and recovery controls continue to apply.
- Current device content must survive migrations. Do not reset data or reinterpret older ungrouped moments without an agreed rule.

## Design round 1 — confirmed by Rikesh

1. **Session boundary:** manual Start/End, one active session, possibly crossing midnight, with capture still available outside sessions.
2. **Original note versus hindsight:** preserve final original capture; add separate dated reflections later.
3. **Draft lifecycle:** automatically save a recoverable draft; Done finalises it.

All three answers were explicitly submitted; none was inferred from a preselected option. The agreed vocabulary is in [CONTEXT.md](../CONTEXT.md). Later rounds below resolve the dependent session and draft decisions.

## Design round 2 — confirmed by Rikesh

4. **Forgotten ending:** keep the session open across restarts and offer Resume/End; do not silently guess its end time.
5. **Correcting grouping:** allow assigning ungrouped moments or moving moments between sessions later while preserving original capture times and recordings.
6. **Reflection owner:** support both per-moment reflections and whole-session reflections.

All three answers were explicitly submitted.

## Design round 3 — confirmed by Rikesh

7. **Boundary corrections:** allow editing session start/end times with clear adjusted information. Original moment capture times remain unchanged.
8. **Draft after End:** keep unfinished notes editable until Done, visibly marked Draft; show the later finalisation time rather than implying completion during the session.
9. **Finished reflections:** preserve completed reflections; changed views and corrections become dated follow-ups.

## Design round 4 — confirmed by Rikesh

10. **End during recording:** stop capture first and preserve the clip. The session may end with visible pending-save recovery once microphone release is confirmed. If release cannot be confirmed, End waits for Stop/recovery. Ending must also invalidate a pending Record request.
11. **Session removal:** Archive/Restore for this increment, retaining moments, clips and reflections in an Archived view. Permanent session-wide deletion is deferred.

All eleven product answers were explicitly submitted. The design proposal below translates them into a reviewable first increment; additional details in the proposal are recommendations, not previously answered questions.

## First design — approved for autonomous execution

Sessions, notes and reflections share ownership and draft rules, so review their design together, then implement and demonstrate them in small steps. Reminder customization and general history/theme work remain later increments.

### Approaches

1. **Recommended: add explicit session, note and reflection records to the existing encrypted journal.** Moments keep their identities and capture timestamps; an optional association supplies grouping. Reuse the existing serialized storage owner and recording recovery. This supports the agreed rules with a focused migration and clear boundaries.
2. **Build the whole journal around an event log.** Every edit and grouping change would become an event. This offers comprehensive replay but introduces substantial migration and query complexity beyond the agreed adjusted-time and immutable-writing requirements.
3. **Separate sessions into another store.** This isolates feature code but complicates atomic ownership changes, recovery and deletion across stores. It offers no clear benefit for this offline app.

### Capture and navigation

- Keep Now fast: emotion taps still save immediately. Add Start Session and a Write note path that does not require an emotion. Starting a text-only moment fixes its capture time; it is visibly a draft until Done.
- Show the active session with End; Sessions opens active/ended lists and a session timeline. On reopening with an unfinished session, show Resume/End without blocking capture. Resume acknowledges that existing session; it never starts audio. New moments use the active session even before that acknowledgement, with the association visible.
- Use the start date/time as the default session label; a custom title is optional. Only one active session can exist, including under rapid taps or restart.
- Existing moments remain ungrouped after migration. Allow assignment, moving and removal from a session; explicit grouping determines membership, not whether capture time falls within corrected boundaries. Moving a moment carries its attached note, clips and moment reflections. Session reflections stay with their session.
- Keep a separate Archived list. Archive only ended sessions; an active one must first complete End. Archiving changes visibility, not content or association. Existing global moment history retains these moments with an Archived session label. Restore returns the ended session to its normal list. Restore does not resume it.

### Writing and time

- Each moment has one original typed note, optional and automatically saved as a draft. A recovered draft opens with its last durably saved text. Done commits the latest text and finalisation time together, then makes that text read-only. Ending a session neither finalises nor deletes its drafts.
- Reflections use the same recoverable draft/Done flow, attached to a moment or session. Completed reflections are read-only and ordered by finalisation time; Add follow-up creates another dated reflection. Follow-ups on a moment move with it.
- Display capture time separately from finalisation time. Preserve the originally recorded session boundaries and show corrected boundaries with an Adjusted indicator and original values available for inspection. Validate end is not before start; corrections do not automatically move moments or reopen a session.
- Show Saving, Saved draft, or Not saved as appropriate. Save failure retains the latest in-memory text and offers retry; do not claim durability for unsaved keystrokes. A stale autosave must never overwrite newer text or reopen a finalised entry. Empty Done stays a draft with a clear prompt; deliberate draft discard requires confirmation and does not delete its owner or clips.

### Storage, recording and failure behavior

- One journal storage interface owns session lifecycle, association, draft updates and finalisation transactions. Screen components render the resulting state; they do not independently enforce invariants. Separate session coordination and writing logic keep the UI manageable without replacing unrelated recording code.
- End immediately cancels any pending start and waits for microphone release. After confirmed release it records the end time, even if clip persistence needs visible retry/discard recovery. Until then it shows that ending is incomplete and retains Stop/recovery controls. Neither return nor a delayed permission result can start capture.
- Failed End persistence leaves the session open and retryable, with audio stopped. Repeated Start/End/Done taps are safe. Navigation and process restart must expose persisted drafts and pending audio work.
- Migrate within the existing encrypted database, preserving every old moment and clip. Update supported-version and media-evidence checks together; never replace a missing media key or rewrite clip identities to change grouping. Keep file deletion coordinated with its existing durable recovery process. New moment-owned text follows existing confirmed moment deletion; archive itself deletes nothing.
- Load session lists and timelines in bounded pages with stable timestamp/ID ordering. This does not substitute for the later general-history pagination deliverable.

### Demonstrations and verification

1. Session storage and migration: fresh/existing databases, rollback, single-active invariant, reopen, corrected boundaries, association and archive/restore. Exercise: predict where a moment appears after moving it while retaining its capture time.
2. Draft and reflection storage: save/reopen, stale-write ordering, failed writes, Done retries, immutable final text and finalisation after End. Exercise: a note begins at 10:55, the session ends at 11:00, and Done is pressed tomorrow; identify which dates remain visible.
3. App integration: demonstrate ordinary and outside-session capture, unfinished-session prompt, timeline, note/reflection drafts and Archive/Restore on the S20. Use synthetic content; preserve existing device data.
4. Recording integration: test End during pending permission, active capture and pending save; simulate unconfirmed release and storage failure in controlled host tests. Check restart, no automatic capture and recovery visibility on the device where feasible. Record exact coverage and limits.

Rikesh approved autonomous completion on 2026-09-23, asking to be notified when the journal features are complete. Proceed with the [sessions/writing spec](superpowers/specs/2026-09-23-sessions-writing-design.md), plans, review and verification without repeated routine permission requests. Additional skill approval gates are superseded by that direction. App data preservation and honest completion evidence remain required.

## Read-only foundation audit

- `Moment` currently contains only ID, emotion ID/label, capture time and the original support-text snapshot. There is no hidden implementation of sessions, typed notes, reflections, configurable emotions or persisted preferences.
- Native schema is version 2. Migration must update both supported-version checks and the prior-media evidence checks that prevent replacement key creation. Preserve all current rows and test rollback/restart with synthetic databases first.
- Existing clip encryption authenticates clip ID, moment ID and clip creation time. Session association must not rewrite those identifiers or timestamps.
- `JournalSession` is the single encrypted connection and serialized work queue, not a trading session. New writes must retain its ordering, recovery and failed-rollback safeguards.
- Moment deletion coordinates database state with file removal and tombstones. Any new attached note/reflection/media data must join that lifecycle rather than bypass it.
- Current moment history loads only the newest 50 native rows; older rows remain stored. Clip paging already exists, but ordinary moment-history paging does not.
- Themes currently live in React state. Emotion definitions are static. Journal voice clips are not a generic image/reminder-media store.
- Reusable verification covers migration preservation/rollback, immutable capture snapshots, input snapshots across queued work, recovery/deletion, cursor ties and single-runtime ownership. Device encryption and media behavior still require S20 checks beyond fixture tests.

Audit references: `mobile/src/storage/types.ts`, `journalSession.ts`, `clipSchema.ts`, `clipJournal.ts`, `mobile/src/journal/controller.ts`, `mobile/App.tsx`, and native `ClipFileVault.kt`. Audit was read-only and did not rerun tests or operate the device.

## Current evidence and open work

- Requested stopping checkpoint: reviewed source through `2be987d`; final 123/123 host tests, TypeScript and Android export passed. Sessions/writing storage and UI are implemented and task-reviewed. S20 storage restart and bounded draft edit/Done checks passed before the final UI locking fixes. Broader Task3 device acceptance remains, then the [reminders/history plan](superpowers/plans/2026-09-23-reminders-history.md). See [current status](PROJECT-STATUS.md) and [dated evidence](reviews/2026-09-23-sessions-writing.md); do not mark the whole item2 milestone complete.
- Design checkpoint validation: local links in the tracker, glossary, status and selected evidence documents resolve; graph IDs are unique and edge endpoints valid (287 nodes / 412 edges); whitespace checks passed. This increment changes public documentation/navigation only. App tests were not rerun and the S20 was not operated.
- The milestone started from a clean checkout at `a873ab2`; the earlier denial-feedback fix has 87 passing host tests, TypeScript, independent review and bounded S20 evidence. These checks do not validate any feature in this milestone yet.
- Read-only storage/UI audit completed; constraints are recorded above. Sessions/writing design is approved and its storage implementation reviewed; later-feature defaults are documented under the user's autonomous-execution instruction.
- Previous device checkpoint: idle audio, zero pending, exact 17-file / 3920423-byte vault baseline preserved. Recheck actual device state before each test; additional user data may exist.
- Recording investigations remain open: original cycle17 failed start, brief first-Play stop, real call/headphone interruptions, low-space/save faults and longer memory behavior. App unlock, backup/restore and release validation remain separate work.

## Resume

Read `PROJECT-STATUS.md`, this tracker and the latest approved spec/plan. Check git state before edits. Resume at the first unanswered design decision or incomplete implementation step; do not restart the completed recording work or assume this milestone is complete because one increment passes.
