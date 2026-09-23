# Sessions and Writing Implementation Plan

> **For agentic workers:** Use subagent-driven-development task-by-task, with review before dependent implementation. Rikesh explicitly authorized autonomous completion and routine decisions; do not pause for repeated approvals.

**Goal:** Add manual trading sessions, immutable finished notes/reflections and recoverable drafts to the encrypted Android journal.

**Architecture:** Extend the existing encrypted connection and serialized queue. Put SQL invariants in a focused feature repository, recording/session coordination in a controller, and writing/session views in separate components.

**Tech Stack:** Expo SDK57, React Native 0.86, TypeScript, expo-sqlite/SQLCipher, Node24 SQLite tests.

**Spec:** `docs/superpowers/specs/2026-09-23-sessions-writing-design.md`

## Global Constraints

- Android first, offline encrypted journal.
- Preserve all existing moments, clips, keys and recording recovery.
- At most one active trading session; explicit grouping never changes capture identity or time.
- Finalised notes and reflections cannot be overwritten.
- Automatic saving reports durability honestly and keeps newer edits on failure.
- No automatic audio start or resume.
- Archive/Restore only; no permanent session deletion in this increment.
- Native version checks must reject unsupported databases without altering them.
- Use SDK57 documentation and existing S20/toolchains; never reset app data.
- Existing branch `codex/android-device-setup` and short-path checkout are deliberately reused. No unrelated worktree/dependency installation.

### Task 1: Durable session and writing repository

**Files:** Create `mobile/src/storage/tradingTypes.ts`, `tradingSchema.ts`, `tradingJournal.ts`, `mobile/tests/tradingJournal.test.ts`; modify `journalSession.ts`, `clipSchema.ts` and existing version tests where required. No screen/native edits.

**Consumes:** `JournalDatabase`, `clipTransaction`, existing `createClipJournal` and its moment deletion lifecycle.

**Produces:** `JournalSession.trading?: TradingRepository` (optional for existing test/demo adapters), exported types and these methods:

```ts
type TradingSession = { id: string; title: string; startedAt: string; endedAt: string | null; originalStartedAt: string; originalEndedAt: string | null; adjustedAt: string | null; archivedAt: string | null };
type TradingCursor = { at: string; id: string };
type WritingOwner = { kind: 'moment' | 'session'; id: string };
type Writing = { id: string; owner: WritingOwner; kind: 'note' | 'reflection'; text: string; createdAt: string; updatedAt: string; finalisedAt: string | null; revision: number };
interface TradingRepository {
  active(): Promise<TradingSession | null>;
  start(input: { id: string; title: string; at: string }): Promise<TradingSession>;
  end(id: string, at: string): Promise<void>;
  adjust(id: string, input: { title: string; startedAt: string; endedAt: string | null; at: string }): Promise<void>;
  archive(id: string, archived: boolean, at: string): Promise<void>;
  sessions(archived: boolean, before?: TradingCursor): Promise<TradingSession[]>;
  assign(momentId: string, sessionId: string | null): Promise<void>;
  membership(momentId: string): Promise<TradingSession | null>;
  timeline(sessionId: string, before?: TradingCursor): Promise<Moment[]>;
  writings(owner: WritingOwner, before?: TradingCursor): Promise<Writing[]>;
  saveDraft(input: Writing): Promise<Writing>;
  finalise(id: string, text: string, revision: number, at: string): Promise<Writing>;
  discardDraft(id: string): Promise<void>;
}
```

All lists page 30 rows, newest first with unique-ID tie breaks; callers request another page only when the previous returned 30. No hard history eviction. Text maximum 20000 characters; title maximum 120; preserve whitespace in stored writing, reject whitespace-only finalisation. Canonical ISO timestamps and nonempty bounded IDs. Reject invalid inputs before mutation. Notes only belong to moments and there is at most one note per moment. Multiple reflection drafts/follow-ups allowed.

- [ ] Write real SQLite tests using the existing fixture. First fail through absence of `session.trading`, then exercise required methods. Initial assertion pattern:

```ts
const session = await createJournalSession(f.db, nativeFixture, options);
assert.ok(session.trading, 'trading repository must be available');
const a = await session.trading.start({ id: 'session-a', title: '', at: '2026-09-23T10:00:00.000Z' });
await assert.rejects(session.trading.start({ id: 'session-b', title: '', at: '2026-09-23T10:01:00.000Z' }));
assert.equal((await session.trading.active())?.id, a.id);
```

- [ ] Run `node --experimental-strip-types --test tests/tradingJournal.test.ts` from mobile and record the intended red failure.
- [ ] Migrate schema2 to schema3 transactionally; extend clip schema acceptance to3 without rerunning v2 DDL. Preserve supported0/1 upgrades and legacy no-vault behavior; no-vault schema>=2 fails. Keep media evidence check for every supported version>=2. Create sessions, association and writing tables, indexes, foreign keys/cascades for text on actual owner deletion. Keep `moment_deletions` owners hidden and reject new text/assignment to deleting owners.

```sql
CREATE UNIQUE INDEX trading_one_active ON trading_sessions((1)) WHERE endedAt IS NULL;
CREATE UNIQUE INDEX writing_one_note ON journal_writings(momentId) WHERE kind = 'note';
```

- [ ] Implement methods via bound parameters and serialized queue. Snapshot object inputs before enqueue. Auto-associate newly saved moments with current active session atomically; immutable retry must not reassign an existing moment. Use an insertion check within a transaction rather than changing `Moment` identity fields. `end` is idempotent and never changes first original ending on retry; `adjust` cannot reopen/close by changing nullness. Archive active session rejects. Empty custom title uses presentation fallback, not a rewritten time.
- [ ] Implement draft revision compare-and-update: stale revisions reject; identical same-revision retry returns the stored entry; same revision different content rejects. Finalise commits newest text/revision/time atomically, rejects later changes and returns identical retries. Final text is never reopened by late autosave. Preserve original owner/kind/createdAt on updates; reject identity changes. Draft discard only deletes unfinalised writing.
- [ ] Add red/green tests for reopen, immutable retry, adjusted/original times, archive/restore, ownership moving, page ties, notes uniqueness, finalisation after End, stale draft ordering, immutable final text, deleted/deleting owner rejection, migration rollback/faults, unknown versions, prior-media missing-key evidence and queued input snapshots. Existing coordinator must delete new text only once actual moment deletion succeeds.
- [ ] Run full `npm.cmd test` and `npm.cmd run typecheck`; commit only feature source/tests. Report commands/counts, exact red evidence and public API differences, if any.

### Task 2: Session and writing UI with safe recording integration

**Files:** Create `mobile/src/journal/tradingController.ts`, `writingController.ts`, `TradingPanel.tsx`, `WritingPanel.tsx`, `mobile/tests/tradingController.test.ts`, `writingController.test.ts`; modify `mobile/App.tsx`, `recording/controller.ts` and its tests as needed. Read final Task1 types first; no duplicate SQL repository.

**Consumes:** `JournalSession.trading`, `openJournalSession`, existing journal and recording controller. **Produces:** session/writing panels and tested controllers wired into Now, support and history/clip detail.

```ts
// Required recording boundary exposed by the existing recording controller:
async function stopForSessionEnd(): Promise<boolean> {
  // Invalidate the pending Record epoch synchronously; wait for active work,
  // stop/release owned capture and playback; return true only after release.
  // Save failure with release confirmed permits End; cleanup failure does not.
}
```

- [ ] Write failing controller tests with deferred repository/permission promises: End before permission resolves never starts capture; End waits for release; failed release retains open session; saved-state failure after release allows End with recovery visible; failed End write leaves session open. Test no recording resume after returning.
- [ ] Write failing writing-controller tests: edit enqueues a snapshotted draft, newest input remains on delayed completion/failure, Done flushes latest text then finalises exactly once, discard invalidates outstanding UI updates, reopening displays saved revision, background flush requests save but does not claim guaranteed OS execution.
- [ ] Implement focused controllers using repository interfaces. Recording method must invalidate before any await and retain active cleanup ownership. UI operation locks prevent duplicate Start/End/Done, and errors stay visible/retryable.
- [ ] Add session list/detail with 30-row pagination, active banner and Resume/End on reopen, optional title, manual boundary correction with explicit timezone/input examples, Adjusted marker with original times. Reject end-before-start. Sessions can cross midnight; don't impose chronology-based membership. Archive ended only, Archived list, Restore.
- [ ] Keep emotion tap capture path immediate. Add Write note creating a synthetic unlabelled moment (`emotionId='note'`, label `Note`, empty support) via journal save; then open original note draft. On saved moment detail expose original note, per-moment reflections, grouping picker including Outside session and paged session choices. Session detail exposes session reflections. Display Draft/Finalised times and read-only finished text; Add follow-up creates a reflection draft. Deliberate discard uses confirmation.
- [ ] Recover draft text using newest persisted revision; autosave every edit through serialized repository, reporting Saving/Saved draft/Not saved correctly. Avoid stale screen/owner completions. Empty Done explains required text. Preserve typed text and offer retry after failures, without displaying raw errors/private paths.
- [ ] Navigation away stops journal audio through existing selection/lifecycle logic; End is available while the current recording controls remain reachable. Pending owners and Stop again remain reachable on every page. Update deletion confirmation to mention notes/reflections/clips; don't alter authorization requirements.
- [ ] Temporary web/ExpoGo demo must present feature unavailability honestly or use an isolated matching memory adapter; never fake native persistence. Real Android is the acceptance target.
- [ ] Run controller suites, full suite, TypeScript and Android Metro export. Commit UI/controller source/tests only. Provide device exercise actions for the root agent.

### Task 3: S20 acceptance and checkpoint

**Files:** `docs/reviews/2026-09-23-sessions-writing.md`, `docs/learning/07-sessions-and-writing.md`, status/tracker and Graphify public navigation.

**Consumes:** reviewed Tasks1/2. **Produces:** exact device evidence and reproducible resume instructions.

- [ ] Baseline device audio metadata/file set without exporting private prose/audio. Verify Metro and USB connection, cold restart existing APK to migrate, preserve all originals. No app-data reset.
- [ ] Through UI create synthetic session/note/reflection, End, finalise draft later, restart, move moment, adjust boundaries, archive and restore. Verify timestamps and text retention using synthetic content only. Demonstrate stored read-only text and draft recovery.
- [ ] Exercise End pending Record/active capture on the S20 only with microphone-safe conditions; otherwise report precise unrun device coverage while host fault cases remain validated. Never record unattended private conversation. Check native idle and recover pending synthetic operations.
- [ ] Confirm original media metadata/file set unchanged except explicitly identified synthetic additions. Remove only deliberately disposable synthetic content via confirmed UI, or retain and label it for learning. Update docs with exact checks and limitations; graph refresh excludes private/local/generated output.
- [ ] Commit/push reviewed milestone, verify remote SHA, and continue to custom reminders/history/theme. This task completing does not complete item2.
