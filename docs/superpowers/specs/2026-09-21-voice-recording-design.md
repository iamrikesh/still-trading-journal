# Voice recording for the S20 — design for review

Status: approved by Rikesh on 2026-09-21, including the temporary private plaintext tradeoff. User decisions: several clips per moment, about four minutes per clip, foreground capture, and low laptop disk usage. The encrypted synthetic-file proof is implemented and verified on the S20; see [dated evidence](../../reviews/2026-09-21-media-vault-proof.md). The clip metadata coordinator, durable native adapter and single encrypted session are implemented; see the [latest integration evidence](../../reviews/2026-09-21-native-clip-integration.md) for exact host/native tests and the S20 exercise checkpoint. Microphone capture and playback remain unimplemented. This design is not a production-security claim.

## What Rikesh will see

After an emotion moment saves, its support screen offers Record. Permission is requested on that explicit action; denial leaves the reminder and moment available. Recording shows a timer and Stop. Stop, the four-minute limit, leaving the capture screen, locking, or switching apps ends capture and begins saving. There is no automatic recording restart.

Saved moments can be opened from history to see their clips and add another. Each clip has its own recording time, duration, Play, Delete, and save status. Adding a clip never overwrites an earlier clip. Only one recording or playback operation runs at a time. While stopping/saving is underway, another recording cannot start. Text support continues to work independently.

The first version has no pause/resume, waveform, transcription, cloud upload, or session recording. A second clip is the way to continue speaking after a stop.

## Core concepts

A moment is a snapshot of what was noticed. A clip is an independent attachment to that snapshot. Capture the moment ID when Record is pressed; later navigation must not change ownership. Keep recording time separate from the original emotion-tap time.

The audio file and its database reference cannot be committed in one SQLite transaction. Persist a small operation record so restart recovery can finish a save or report a failure. Stopped, saved, and cleanup pending are different states.

## Options and recommendation

1. **Recommended candidate: Expo Audio plus native streaming file encryption using Tink.** Keeps encoding/playback in Expo and uses an established encrypted stream format. A local Android Expo module owns file encryption, key access and cleanup. Native integration and S20 lifecycle behavior must pass the first proof before this becomes the implementation choice.
2. **Existing Expo Crypto AES-GCM buffers.** Avoids another crypto dependency, but its documented interface accepts buffers rather than file streams. Four-minute clips are small, yet transferring complete media through JavaScript conflicts with the project's bounded native-file approach. Do not invent a chunked encryption format to work around this.
3. **Capture directly into an encrypted stream.** Reduces plaintext storage during capture, but requires more recorder, encoder and playback integration. This is a separate design if temporary plaintext is unacceptable.

This recommendation accepts temporary plaintext during capture and playback, inside app-private storage excluded from backup. It promises encrypted committed media only after verification. Removing temporary files is not a promise of forensic erasure from flash.

## Boundaries and file ownership

- UI keeps IDs, durations and status; it never keeps audio bytes or keys in React state.
- A recording controller owns permission, a single native recorder/player and transitions. Stale callbacks are ignored by operation ID. Double Stop is idempotent.
- A clip repository owns versioned SQLite migrations, clip metadata, pending operations and paged listing. Existing moment snapshots are preserved. A transactional migration from schema 1 adds the clip structures; rollback and old rows are tested.
- A native media vault accepts generated IDs, validates owned paths, encrypts/decrypts in bounded chunks and performs cleanup. It accepts no arbitrary external file paths from screens.
- Store ciphertext under a private no-backup directory with generated names. Store only relative identifiers and metadata in SQLCipher, not audio/base64. Validate staging files as regular owned files with bounded size before reading them.
- Keep a separate random media keyset encrypted by an Android Keystore wrapping key. Key material stays native and out of logs. Check for existing keysets/media before initialization: missing or invalid keys must fail closed, never silently create replacement keys over existing data. Validate the exact supported Tink key-management API during the proof.
- Bind format version, moment ID and clip ID as authenticated associated data. These are identifiers, not journal text. Let the maintained encryption implementation manage its nonce/segment format.

## Save and recovery protocol

1. Confirm the moment is saved, storage headroom is available, and permission is granted. Allocate a clip ID and persist an intent under that moment before capture starts.
2. Prepare a private recorder output, register its path against the intent, then start capture. Verify this ordering is supported by the installed Audio API; if not, add a native adapter before claiming recovery coverage.
3. Stop/finalize the recorder and check actual duration, bytes and playability. An empty or unfinalized file is a failed capture, not a saved clip.
4. Encrypt into an owned temporary ciphertext file. Close and flush output, verify complete authentication, then finalize its filename on the same filesystem. Validate crash behavior on Android; a rename alone is not proof of power-loss durability.
5. In one database transaction, attach the final file reference and mark the clip committed. Retrying the same clip ID cannot create a second clip.
6. Delete plaintext staging and clear the operation record. Show saved when the commit and required cleanup succeed; distinguish a committed clip with cleanup pending from a fully completed save.

On startup, reconcile pending operations before enabling capture. A valid staged file can be offered for save retry; a complete verified ciphertext file can finish its metadata commit. Preserve a useful draft when saving fails. Never delete the only recoverable copy as routine cache cleanup. Invalid/empty unfinished recordings are reported as unrecoverable with an explicit discard action. A force-kill during recording may prevent the AAC container from finalizing; preserving every captured second is not guaranteed.

An interruption may stop capture before encryption finishes. On return, show saved, retry available, or failed according to evidence; never show saved merely because the recorder stopped. Permission-dialog transitions must not accidentally start/stop a recording. Check native lifecycle behavior, including screen lock and phone/audio-focus interruptions; a JavaScript AppState listener alone is not sufficient proof.

## Playback and deletion

Authenticate and decrypt a selected clip to one owned temporary playback file, completely, before exposing it to the player. Reject wrong-key, altered, truncated or wrong-owner ciphertext. Remove any partial plaintext on failure. Stop/release the player and remove its file on completion, navigation, lock or app switch; clean abandoned playback files on startup.

Deleting a clip first records a deletion intent, stops any owner operation, and removes ciphertext/staging/playback files before final metadata cleanup. Retry interrupted deletion on restart. Deleting a moment must also delete all its clips through this coordinated flow; the existing direct moment DELETE is insufficient. Serialize save/deletion for the same owner so a late save cannot recreate a deleted clip. Confirmation describes all affected clips. Do not silently cascade away the only cleanup records.

## Proposed resource policy

- Four minutes per clip; mono AAC around 64 kbps. Estimate: 1.92 MB for four minutes before overhead, not a measured size.
- Provisional encoded-file ceiling: 4 MiB, checked natively and again before encryption. Validate actual encoder behavior and overshoot on the S20. Exceeding a limit stops capture and reports the actual outcome.
- Initial capture/playback admission reserve: 100 MiB free on the phone, plus allowance for the operation's temporary files. This is a conservative starting threshold to measure, not a guarantee; handle write failures even after admission.
- Keep saved/draft byte accounting and show total usage. Warn at 250 MiB of retained audio; do not impose a destructive rolling quota or automatically delete original clips. Refuse a new operation when headroom is insufficient and explain how to free space.
- List clips 20 at a time. Decode only the selected clip. Measure native/PSS and JavaScript memory separately over repeated operations.
- Laptop: use the existing S: alias, JDK, SDK, ARM64 build and Gradle caches. No duplicate dependency tree, emulator, routine clean build or extra APK copies. Recheck free space before adding native dependencies. Module/native config changes require a rebuild; ordinary JavaScript changes use Metro.

The byte ceiling and storage thresholds above are initial defaults, adjustable after measurements. Native fixture operations now enforce the 4 MiB / 240000 ms bounds and 100 MiB reserve plus working allowance, with host boundary tests. Actual microphone size, quality, aggregate usage warning and repeated-cycle phone resource measurements remain to be implemented and measured.

## First demonstrable increment and gates

Start with a tiny generated synthetic file, not microphone audio. Build only the minimum local native vault integration needed to prove: encrypt/decrypt equality, cold-restart access, incorrect-key rejection, tamper/truncation/wrong-owner rejection, bounded file processing, cleanup after failure, and no silent reset after key loss. Test destructive key-loss cases in an isolated test namespace, never against the existing journal key or files.

Then connect recoverable file/metadata commit and deletion using fixture files. Inject failures at each transition, including low-space write failures and termination after file finalization but before metadata commit. Verify migration preserves existing synthetic moments and retries do not duplicate clips. A failed native proof changes the adapter choice before recorder UI work proceeds.

Finally add Expo Audio and the visible controls. Remove the existing RECORD_AUDIO block intentionally, add the Audio plugin, disable background capture/playback, and inspect the merged manifest and backup/data-extraction rules. Use the installed SDK-compatible package version and verify its native source; do not copy obsolete API examples.

S20 checks: denial/revocation, immediate Stop, repeated Record/Stop, four-minute auto-stop, several clips on one moment, owner navigation, playback, calls/headphone changes, lock/app switch, cold restart, force-kill, low space, deletion and repeated-cycle resource measurements. Record observed behavior separately from host tests. Use synthetic recordings throughout.

Passing this increment does not close app unlock, release backup/restore, missing-key recovery UX, release privacy/signing or the other existing release gates.

## Sources checked on 2026-09-21

- [Expo SDK 57 Audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/): recorder/player APIs, permission and default cache location.
- [Expo SDK 57 Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/): AES-GCM buffer interface.
- [Expo local native modules](https://docs.expo.dev/modules/get-started/): supported local-module integration route.
- [Tink encrypted file/stream examples](https://developers.google.com/tink/encrypt-large-files-or-data-streams): maintained streaming authenticated-encryption primitive; sample cleartext key handling is not our key design.
- [Project security requirements](../../../SECURITY-AND-PERFORMANCE.md) and [current checkpoint](../../PROJECT-STATUS.md).
