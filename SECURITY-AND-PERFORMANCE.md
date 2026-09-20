# Security and memory requirements

Updated 2026-09-20. Engineering requirements for the future Android MVP, informed by the prototype review and product decisions. These are not claims that an Android app, encrypted storage, authentication, or a backend already exists.

## What we are protecting

Personal voice recordings, transcripts, emotion labels, reflections, session timestamps, support images, and any future account credentials. Treat the journal as private even when it contains no financial account data.

Our relevant threats are accidental disclosure through logs/backups/exports, lost devices, unauthorized access to future cloud data, unsafe media imports, interrupted or failed saves, and memory exhaustion. No application can guarantee protection on a fully compromised device or absolute freedom from vulnerabilities. Security is a tested, maintained property.

Use the [OWASP Mobile Application Security Verification Standard](https://mas.owasp.org/MASVS/) as a review framework. Map applicable storage, cryptography, platform, code, network, and privacy controls to actual tests before release. Do not claim certification or full compliance merely because this document exists.

## Current state

- The browser concept has no accounts, backend, real microphone capture, durable storage, or application encryption.
- It runs inside the preview host; that host is part of its trust boundary. The preview is not a secure vault for real private journals.
- Attachment selection stays in the preview; the prototype code does not upload it. Closing/reloading discards preview state.
- Security regression checks apply to the browser concept only. They do not validate Android native modules, signing, operating-system backup rules, or cloud authorization.

## MVP direction and alternatives

Choose an offline-first Android MVP. This is consistent with the approved personal-use scope and avoids requiring an account or network connection during emotional capture.

A cloud-first MVP would simplify some recovery and synchronization use cases, but would introduce server authorization, retention, account recovery, and upload privacy work immediately. Add cloud synchronization only when needed and tested.

An unencrypted local prototype is adequate for testing layout with sample content. It does not meet the proposed release standard for real private journals.

## App architecture boundaries

| Component | Responsibility | Must not do |
|---|---|---|
| Screens and theme | Show UI and temporary form state | Hold entire recordings or the whole journal in memory |
| Session service | Validate and connect sessions, moments, reflections | Write SQL assembled from user text |
| Support-card service | Manage text/audio/image combinations | Confuse prerecorded logic with a session recording |
| Recorder service | Own one recording session and report actual status | Claim success before a file is safely committed |
| Media repository | Private files, validation, metadata, thumbnails, removal | Put base64 media into application state or database rows |
| Journal repository | Paged metadata queries, migrations, transactions | Load every session to render one screen |
| Key and vault service | Key lifecycle and authenticated encryption | Invent a cryptographic algorithm or log keys |
| Future sync/transcription | Explicitly requested remote processing | Run automatically on newly captured private audio |

Keep these responsibilities separate without introducing microservices for a one-person MVP.

## Storage and encryption release requirements

1. Store recordings, imported media, thumbnails, and the journal in app-private locations. Use generated identifiers for filenames; never concatenate imported filenames into filesystem paths.
2. Encrypt sensitive journal data and media at rest before real private use. Database encryption and file encryption are separate tasks; encrypting SQLite does not encrypt an adjacent audio file.
3. Store small encryption keys and eventual account tokens using platform-backed secure storage. Do not store recordings or transcripts in SecureStore. Expo documents platform limitations for large values. [SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/)
4. Evaluate SQLCipher for the native journal database. Expo supports it in native builds but not Expo Go; use a development build when testing this configuration. Never ship a hardcoded database password. [Expo SQLite / SQLCipher](https://docs.expo.dev/versions/latest/sdk/sqlite/#sqlcipher)
5. Select a maintained native authenticated-encryption implementation for media. Validate file streaming, nonce uniqueness, authentication failures, key invalidation, and crash recovery before committing to it. This library choice is still an implementation prerequisite, not a completed protection.
6. Minimize temporary plaintext files during recording/import/playback. Keep unavoidable temporary files private, remove them after use, and reconcile leftovers after a crash. Document the exposure window; do not claim audio is encrypted while a recorder is writing plaintext.
7. Explicitly configure Android backup/data-extraction rules for private files and keys. Do not assume platform defaults satisfy the privacy design.
8. Use parameterized queries, schema validation, atomic metadata transactions, and versioned migrations. Test migration rollback and interrupted saves using copies of fixture data.
9. Commit media and metadata as a recoverable operation: finalize file, validate, encrypt, commit a metadata reference, then mark saved. A failed save leaves the draft available and reports the failure. Reconcile orphan files and broken references after crashes.
10. Offer encrypted export/recovery and deletion before relying on the app long term. Recovery must be designed with encryption: losing a key can make backups unreadable. Remove associated files, thumbnails, and derived transcripts when deleting an entry; do not promise forensic erasure from flash storage.

Expo Audio defaults to recording in disposable cache storage. Our recorder must explicitly choose a suitable private document location and a cleanup/commit policy. [Expo Audio recording](https://docs.expo.dev/versions/latest/sdk/audio/#recording-sounds)

## Access, permissions, and privacy

- Ask for microphone permission when the user begins recording; preserve the note flow when permission is denied.
- Confirmed MVP behavior: foreground recording only. Switching apps or locking the phone stops capture and preserves the captured portion. On return, distinguish successfully saved audio from a recoverable draft or failed save; never resume capture automatically. Android lifecycle handling and abrupt interruption behavior must be verified on the target device. Add background recording only if separately requested, implemented, and tested.
- Prefer the system file/photo picker to broad storage permissions.
- Provide device-authenticated app unlock and reauthentication for export, with an intentional session grace period so it does not obstruct every emotion tap. Final timeout/fallback behavior needs testing with the user.
- Hide sensitive app-switcher previews. Decide screenshot behavior explicitly; keep notification text generic.
- Keep private text, audio, file paths, keys, and tokens out of logs, analytics, crash breadcrumbs, and test output.
- No advertising SDKs or automatic journal telemetry in the MVP. Future transcription uploads require a clear choice and an explanation of where data goes.
- Treat imported files as untrusted: bound bytes, dimensions, durations, and concurrent processing; reject unsupported content; normalize images and remove metadata before persistence.

## Future network boundary

When accounts/sync/transcription arrive, require TLS, server-side ownership checks for every record and media object, private object storage, expiring access links, request limits, upload validation, and per-user deletion/retention behavior. Test cross-user access directly. Client-side checks never substitute for authorization.

Service secrets belong on the server. A value bundled into a mobile or web app is not secret. Keep separate development and release credentials; use lockfiles, dependency review, signing-key protection, and controlled releases.

## Memory and storage principles

RAM is temporary working space; disk storage holds files between launches. A storage quota is not a RAM budget. Measure both.

- Record/play using native file APIs. Keep only file identifiers and metadata in JavaScript state.
- Permit one recorder and one active player; stop/pause/release each according to ownership and lifecycle. Cancel timers, subscriptions, decoders, and async operations on exit.
- Load journal metadata in pages (initial proposal: 50 entries); render a virtualized list and small thumbnails. Load full text and media only for an opened entry. [React Native list guidance](https://reactnative.dev/docs/optimizing-flatlist-configuration)
- Query with stable timestamp/ID pagination and indexes. Avoid fetching all history and slicing it afterward.
- Normalize support images to display-appropriate resolution, generate bounded thumbnails, and keep decode concurrency at one. An 8 MB compressed file can decode to much more RAM.
- Start by evaluating mono AAC around 64 kbps for voice. That is approximately 0.48 MB/minute of encoded audio, excluding container overhead. Choose quality based on recordings from the actual phone.
- Keep waveform display samples bounded; avoid saving every microphone sample in UI state. UI meter updates need only a modest frequency.
- Use shared theme tokens and short transform/opacity transitions. No perpetual decorative animations during a trading session.
- Clean obsolete caches by ownership/age/size, never by deleting original journal recordings. Warn before storage is exhausted; preserve existing data.

## Prototype-specific safeguards now implemented

These limits keep the disposable browser preview bounded. They are not permanent limits on the future user's journal.

- 4,000 characters per note/reflection, 1,000 per logic text, 300 per next step; shortened list previews.
- 100 preview moments maximum. Further saves are refused visibly; existing moments are not silently removed.
- Images: up to 8 MB, 4 megapixels, and 4,096 pixels per side. Check recognized header dimensions before decoding, then check decoder output.
- Audio: up to 15 MB and five minutes for an imported support reminder; recognized headers and playable metadata required.
- Aggregate retained media bytes: 24 MB, including retained drafts. This is a media-retention cap, not a guarantee of browser-process RAM usage.
- Object URLs reference selected files without converting them into base64 strings. Revoke abandoned/replaced references and dispose on removal. [Object URL cleanup](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)
- Media validation has cancellation, stale-result checks, and an eight-second decoder timeout; temporary hiding pauses playback rather than removing a saved source.
- Input text remains escaped when rendered. Theme edits preserve unsaved form content.

Header/decoder validation does not prove a file is harmless to all browser/native decoder implementations. Maintain dependencies and keep the production import path separately reviewed.

## Measurable Android release gates — not yet run

Test a release-like native build on an agreed physical Android phone, ideally including a 4 GB RAM device. Record OS, device, build, dataset, baseline, and peak measurements.

| Gate | Proposed evidence |
|---|---|
| Fast support access | Cached emotion-to-text-card p95 under 150 ms after app unlock; image/audio preparation never blocks text |
| Stable memory | Warm up, run 30 capture/play/review/theme cycles, return to baseline, and compare native/PSS and JS heap separately; no continuing upward trend or retained players/listeners |
| Large journal | 10,000 metadata entries with on-disk media fixtures; initial query remains paged and scrolling never decodes all attachments |
| Recording durability | Close/reopen; permission denial; phone call/audio-focus loss; low space; forced termination; correct recording file and session linkage afterward |
| Privacy | Inspect release logs, backups, exports, private files, temporary files, app switcher, and network activity |
| Crypto/recovery | Encrypted DB/media unreadable without keys; tampered ciphertext rejected; documented key-loss/restore behavior tested |
| Input boundaries | Malformed media, incorrect MIME, enormous dimensions, empty files, oversized notes, repeated imports, cancellation during validation |
| Release hygiene | Reproducible lockfile/build, dependency and secret checks, signed artifact, no debug backend or test credentials |

The 150 ms goal and device choice are proposed acceptance targets, not performance measurements. Establish a baseline before setting an absolute RAM ceiling; JavaScript heap alone misses native audio/image allocations.

## Next implementation sequence

1. Real Android Record / Stop / Play with permission and interruption handling, using sample recordings.
2. Prove private file ownership, encrypted persistence, recovery, and cleanup in a native development build.
3. Add sessions and multimedia support cards on those foundations.
4. Add paged review, themes, export/deletion, and device profiling.
5. Complete security and release checks, trial personally, then prepare a limited live release.

Explain each concept as it enters the implementation. Security and memory requirements accompany the MVP; they are not deferred to a later cosmetic cleanup.
