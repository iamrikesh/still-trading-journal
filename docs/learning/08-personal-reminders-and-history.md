# Lesson 8 — editable reminders and preserved history

These features are implemented and have bounded S20 evidence. Check [project status](../PROJECT-STATUS.md) and the [dated evidence](../reviews/2026-09-24-reminders-history.md) for completed review corrections and verification limits.

## A saved reminder and an editor draft are different things

Suppose your saved reminder contains a picture and the text “Pause and check my rules.” You open its editor, choose a replacement picture and change the text. Those changes belong to the draft until Save succeeds.

Cancel keeps the saved card. A failed import keeps the previous draft attachment. A failed Save keeps the draft available to retry. Saving the text and attachment references together prevents a half-updated card after an interruption. The encrypted journal's transaction supplies that all-or-nothing boundary.

## Current support and historical captures have different owners

A reminder button is editable. A captured moment keeps the label and support text that were present when you tapped it. Editing today's reminder cannot rewrite yesterday's moment.

An image or reminder audio belongs to the current reminder card. It is not copied into every captured moment. Journal voice clips belong to their moments; reminder audio is a separate attachment with separate playback controls.

## Only one audio operation owns the device

An idle-looking screen does not prove an old player has released its resources. Native ownership must also confirm that capture/playback is stopped and any required cleanup has finished before another audio operation starts.

If cleanup fails, the app retains an obligation to retry and blocks competing audio. Navigation, backgrounding or a delayed picker result must never start playback on its own. Playback is an explicit action.

Saved attachments use the encrypted database. Playing an audio attachment needs an owned private temporary file, which must be removed after release. This is a limited plaintext tradeoff during playback, not a promise that media is encrypted at every instant in memory or on disk.

## A history page is a window, not a retention limit

Fetching fifty moments does not mean only fifty moments exist. An Older action asks for the next bounded page. Ordering by capture time and unique ID gives equal-time entries a stable order, avoiding skipped or duplicated items at page boundaries.

The selected appearance is another small saved value. Choosing Light or Dark can change the current screen immediately; persistence is a separate operation, so a failed save must remain visible and retryable.

A page also belongs to a particular view. A session's Older cursor must come from that same session. Switching from session A to B must invalidate A's pending requests and hide its rows while B loads. A request number alone cannot protect against using a cursor from the wrong owner. Whole-milestone review exposed this case; the controller now enforces the owner and generation together, with delayed/failing-read regressions recorded in the dated review.

## Predict before trying

Use the retained **Feature test reminder Sep24** card and **Feature test history Sep24** session for these exercises:

1. Replace an image, then Cancel. Which image should appear after reopening the card? The previously saved one.
2. Save a reminder, tap it, then change its text. Which text belongs to the earlier moment? The snapshot captured at the tap.
3. Start reminder playback, then leave the screen. Should returning start it again? No; Play must be explicit.
4. A previous player cannot confirm cleanup. Should Record start because the UI looks idle? No; native ownership must be released.
5. Load Older and find another moment with the same timestamp. What distinguishes its position? Its unique ID.
6. Choose Dark, then restart. What evidence shows it was saved? The new process reloads Dark from storage, rather than retaining the old screen's state.

## Verification record

On the S20, the synthetic reminder kept its original captured text after the card changed. Its small PNG/WAV survived restart; Cancel preserved them after larger replacements, and Save persisted image removal. Explicit Stop and backgrounding removed the owned playback temporary. The 51-entry paging exercise crossed the 50-row boundary; only entry00 with its finalised note remains. Dark, Light and System survived process restarts.

Host fault tests, JVM media seams, Android compilation and real system-picker/playback checks establish different facts. Memory snapshots do not prove leak freedom, and a debug APK does not establish production readiness. The dated evidence records the approved correction wave and changed-flow device checks separately. App unlock, encrypted backup/restore, missing-key recovery and release validation remain separate release gates.
