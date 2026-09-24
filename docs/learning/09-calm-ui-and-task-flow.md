# Lesson 9: make the next action easy to find

A screen can be technically correct and still take too much effort to use. UI is the presentation; UX includes finding an action, completing it, understanding what happened, and returning to the right place.

## What changed

Previously, Now introduced the app with a large heading, then showed reminder cards, with note and session actions below them. The new layout shortens the introduction and places those daily actions near the top. Appearance and management live in Settings.

This is **visual hierarchy**: important actions receive more prominent positions and a clear treatment. Making every control equally large or bright would remove that hierarchy. Shared typography, spacing and button styles help the same action feel familiar on different screens.

Writing now opens with the current note before its reflection history. Done stays above the keyboard, and Back returns to the entry screen. Those choices reduce both searching and unnecessary navigation.

## Why the phone check mattered

The first fixed Done area still sat under the S20 keyboard. TypeScript and controller tests passed because they do not measure a rendered keyboard. The actual phone exposed the problem; root keyboard avoidance fixed it. The completed check included an active session and 130% system text, then restored 100%.

Another regression appeared during review: leaving a reminder cleared its displayed media. Returning from writing needed to reload the media without capturing another moment or playing audio. A dedicated test now checks that distinction.

## Exercise for next time

1. On Now, find Write note without scrolling.
2. Open a saved note from My moments and use Back. Predict the destination before tapping.
3. Open a session. Which should be easier to find: its moments/reflections, or a correction to its start time? Explain your choice.

The third question guides the next increment. See [the evidence](../reviews/2026-09-24-calm-ui-first-pass.md) for what was verified and what remains open. A successful 130% text check does not replace TalkBack testing or testing larger text on other devices.
