# Lesson 7: capture time, grouping and hindsight

A moment records when you noticed something. A trading session groups moments into a period you deliberately start and end. These are separate facts: correcting a session or moving a moment must not rewrite when you captured it.

An original note starts as an editable draft. Automatic saving protects the last successfully stored draft; the interface must distinguish Saving from Saved and show failures honestly. Done records a separate finalisation time and preserves the finished text. A later reflection adds another dated account instead of overwriting the original.

Consider a note started at 10:55 pm. You end the session at 11 pm, then finish writing tomorrow at 8 am. The moment still says 10:55 pm, the session still ends at 11 pm, and the note says it was finalised tomorrow. Keeping these three times avoids pretending hindsight was available during trading.

## Predict before trying

1. Move that moment into another session. Which times should change? None; only the grouping changes.
2. Correct the original session ending to 10:58 pm. Should the moment move automatically? No; explicit grouping remains, and the boundary is marked adjusted.
3. Add a reflection, finish it, then change your mind. What happens next? Add a dated follow-up; the finished reflection remains readable.
4. Archive the session. What is deleted? Nothing; its contents remain accessible and the session can be restored.
5. Press End while a microphone permission request is pending. Can granting it later begin recording? No; End cancels that request.

## Verification status

Session/writing storage and UI are implemented and reviewed. September24 S20 checks covered session restart/Resume, draft recovery, finalisation after End, reflections/follow-ups, moving a moment, boundary corrections, Archive/Restore and End during active recording. Delayed permission/release and write-failure cases retain host-test evidence; use the [latest dated review](../reviews/2026-09-24-sessions-acceptance.md) for precise limits. A discovered reflection-list rendering warning was fixed and device-rechecked.

For a retained example next time, open Sessions → Feature test Sep23. Its two moments are synthetic. The note labelled Feature test draft was subsequently finished through the UI and now reads “Feature test edited on S20.” Compare its capture time with finalisation time and the session ending.

The newer **Feature test Sep24** contains one Note, a moment reflection and two session reflections. Its Note moved to another session and back without changing its original capture time. Its corrected session boundaries cross midnight; compare them with the original boundaries. The disposable recording was explicitly deleted, while the writing remains. Explain why a moment reflection follows the moment but a session reflection stays with the session.
