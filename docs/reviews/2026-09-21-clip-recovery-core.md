# Host clip recovery core — 2026-09-21

## Scope

This increment implements the opt-in TypeScript metadata coordinator from the approved voice design. It uses real SQLite databases and generated, disposable filesystem fixtures to test save/delete ordering and restart recovery. The fixture adapter is deliberately noncryptographic; it does not add to the native encryption evidence in the [earlier S20 review](2026-09-21-media-vault-proof.md).

The installed app's opener, UI, native module and permissions are unchanged. Its database is not migrated here. No phone operation, APK rebuild, emulator, dependency installation or extra APK copy was needed. The native Tink adapter for these new contracts, S20 migration, process termination, storage exhaustion and recording/playback checks remain required before activation.

## Persistence contract

- Schema 1 to 2 migration is opt-in and transactional. Existing moments retain their snapshots.
- Clip intents retain immutable ID, owner and timestamp. Only saved, non-deleting moments may receive new clips.
- The vault must produce and verify a final file before its metadata commits. Required staging cleanup completes before the clip reports saved.
- Failures retain recovery records. Recovery visits work in bounded pages and can progress past failed entries.
- Deletion records precede file removal; metadata disappears only after file cleanup. Tombstones prevent stale callbacks from recreating deleted IDs.
- One repository owns database writes and vault operations. Future integration must retire the legacy journal object and prevent any other connection/owner from bypassing this contract.

## Automated evidence

- Initial targeted run failed because `clipJournal.ts` did not exist. The first 11 real-SQLite/filesystem cases then passed after implementation.
- Added regressions cover changed metadata on cleanup retry, database failure after staging removal, database failure after file deletion, caller snapshots across queued work, foreign-key enforcement, failed rollback, and paging deletion owners including an empty legacy owner ID.
- Two rollback regressions failed with missing expected rejection before the connection-retirement fix. They now verify that uncertain transactions prohibit further work, including reuse after a failed migration rollback. A newly opened connection can retry recovery.
- Final implementation run: **20 new clip-recovery tests passed; all 46 Node tests passed; TypeScript checking passed**. Commands from `mobile`: `node --experimental-strip-types --test tests/clipRecovery.test.ts`, `npm.cmd test`, `npm.cmd run typecheck`.
- Tests create real SQLite files, close/reopen them and inspect actual generated file/row outcomes. They check several clips per moment, idempotent retries, 20-item history pages, missing/invalid staging, invalid metadata, tampered final rejection on retry, cleanup-pending, individual and whole-moment deletion recovery, stale callbacks and operation serialization.
- The Node runner emits its existing experimental `node:sqlite` warning. This is host SQLite, not SQLCipher or Android Keystore execution.

Root reran `npm.cmd test` and `npm.cmd run typecheck` on source commit `ef268d9`: 46/46 passed, no skipped/cancelled tests, typecheck exit 0. `git diff --check` passed; all eight new graph source paths exist and graph endpoints are valid.

Independent task review found the implementation spec compliant and approved its quality with no blocking defect. It confirmed that retiring the legacy journal object and enforcing one owner across native connections/reloads remains an integration precondition. The expected Node experimental SQLite warning was noted; it remains visible rather than being suppressed.

The broader final milestone review found no blocking recovery or handoff defects. It identified one outdated status sentence in the approved voice design; that sentence now distinguishes the completed host coordinator from pending native/device integration. No source change followed the 46-test/typecheck verification.

## GitHub checkpoint

At Rikesh's request, `f302e65` (approved design) and `45862b2` (native file proof) were pushed to `origin/codex/android-device-setup`. The push reported `8ffa557..45862b2`; a separate remote read verified full SHA `45862b2fc7fbcabb1db6586eab4c9a72d1dda918`. Before that push, all 26 existing Node tests and typecheck passed. No merge or default-branch update was performed. The subsequent recovery-core work remains local unless a later status records another push.

## Limits

Host reopen tests establish repository behavior after interrupted operations; they do not establish Android process-kill or power-loss durability. The file-vault interface describes obligations, not their native implementation. Runtime microphone permission, actual four-minute enforcement, media playability, native size validation, backup exclusions and key-loss UX are separate acceptance work.

Tombstones retain small identifiers to reject stale operations. Their future retention policy must preserve that protection; this increment does not claim a total storage cap. Aggregate audio/staging byte accounting and phone free-space admission remain part of the native integration. No recording is silently deleted for space.
