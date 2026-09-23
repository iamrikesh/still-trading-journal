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

Session/writing storage is implemented and independently reviewed. The S20 retained an ended/adjusted synthetic session, notes and reflection across restart. A bounded UI check recovered a draft, edited it, pressed Done and verified its finished text after another restart. Broader UI and failure checks remain; use the [dated review](../reviews/2026-09-23-sessions-writing.md) for precise coverage rather than treating every example above as a completed test.

For a retained example next time, open Sessions → Feature test Sep23. Its two moments are synthetic. The note labelled Feature test draft was subsequently finished through the UI and now reads “Feature test edited on S20.” Compare its capture time with finalisation time and the session ending.
