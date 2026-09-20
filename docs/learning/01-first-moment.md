# Lesson 1 — From a tap to a saved moment

You already have some programming experience. This lesson connects familiar JavaScript functions and objects to React Native's screen model. The goal is to explain one complete behavior yourself: **tap FOMO → see support → record a timestamp → find it in history**.

## The pieces

**React Native** renders screens with components such as `View`, `Text` and `Pressable`. **Expo** supplies the development/build tools and native device libraries. **TypeScript** checks the shapes of values before the app runs; it does not replace runtime checks or tests.

Start with `mobile/src/journal/emotions.ts`. An emotion is an object with a stable identifier, label, explanation, support text and next action. The TypeScript `Emotion` type describes that shape. `App.tsx` maps the array to cards. This is data-driven rendering: another valid object can produce another card without copying a screen.

## A tap is an event

In `App.tsx`, a card's `onPress` calls `controller.tap(emotion)` and opens the support view.

The controller gives each moment an ID and a timestamp, then updates its state immediately. React reads that state and redraws the appropriate text. This is **state-driven UI**: we describe what should be visible for a state, rather than finding a label on screen and manually replacing it.

## Saving takes time

A database write is asynchronous. `await` waits for its result inside an asynchronous function; it does not mean the entire screen should freeze.

Our save states are `idle`, `saving`, `saved` and `failed`. The reminder appears while the write is pending. A write failure keeps the reminder visible. Retrying uses the same ID and timestamp so one experience does not become two journal entries.

An older write might finish after a newer one. The controller checks which moment is currently selected before changing its save status. That is a **race condition** we can reproduce and guard with a test.

## Memory and persistence are different

Temporary JavaScript objects disappear on reload. That is how the browser and Expo Go demo work. Native history uses SQLite: data survives closing and reopening only after a successful database write.

The UI asks a repository to `save`, `list` or `remove`. It doesn't need to know the SQL. Both the temporary demo and native implementation follow that interface. This is a small example of separating responsibilities without creating a complicated framework.

SQLite encryption protects the database file; it does not automatically protect future audio files, screen contents or exports. Those need their own design and checks. The database key goes in secure storage; a key lost on uninstall cannot be recreated from the encrypted database.

## Your first exercise

1. Run the temporary demo using the README commands.
2. Open `mobile/src/journal/emotions.ts`.
3. Change the **FOMO support text** to an original reminder you would find useful. Do not change its `id`.
4. Tap FOMO and confirm your text appears. Visit My moments and check that a timestamped entry exists.
5. Switch light/dark appearance. The moment should remain in the current demo session.
6. Reload the demo. Its history should be empty: this demonstrates the difference between state and persistence.

Some browser checks intentionally expect the current starter reminder; if you permanently edit it, update that expected copy too. Keep the behavior assertion: tapping must reveal the correct support and create a moment.

Before we move on, try explaining these in your own words:

- Why is `emotion.id` different from its display label?
- Why should the support card appear before the save finishes?
- Why does retry reuse the original moment ID?
- Why can a browser test pass without proving Android encryption works?

## Read a test

Open `mobile/tests/controller.test.ts`. Start with the test where storage never becomes ready. It still expects the selected emotion and original timestamp to be visible immediately.

That test first failed against the stub implementation, then passed after we added the behavior. This is the **red → green** cycle. Tests help us change the code later without accidentally making support wait for disk access.

## Git and GitHub

**Git** records local snapshots called commits. **GitHub** hosts a repository so others can see the code and history. A **branch** lets us work on an increment without overwriting an established release. **CI** runs checks automatically when code is pushed.

Useful read-only commands from the repository root:

```powershell
git status
git log --oneline
git diff
```

Your portfolio story is not just the finished screen: it is the problem, the trade-offs, how you verified the result, and what you learned. The next lesson will use real microphone capture to introduce permissions and resource ownership.
