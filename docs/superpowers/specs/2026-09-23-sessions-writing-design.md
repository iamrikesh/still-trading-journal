# Sessions and writing design


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

Approved for autonomous execution by Rikesh on 2026-09-23. The instruction to complete the milestone without intermediate permission questions supersedes additional skill review gates. Implementation and verification remain required.


## Binding constraints

- Android first, offline encrypted journal.
- Preserve all existing moments, clips, keys and recording recovery.
- At most one active trading session; explicit grouping never changes capture identity or time.
- Finalised notes and reflections cannot be overwritten.
- Automatic saving reports durability honestly and keeps newer edits on failure.
- No automatic audio start or resume.
- Archive/Restore only; no permanent session deletion in this increment.
- Native version checks must reject unsupported databases without altering them.
- Use SDK57 documentation and existing S20/toolchains; never reset app data.

## Self-review

Ownership and time rules are consistent with all eleven submitted answers. Migration, draft failure, End/recording and archive behavior have explicit acceptance checks. This spec covers the coupled session/writing subsystem; custom reminders and general history/theme use their own subsequent plan.
