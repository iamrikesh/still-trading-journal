# Review of the initial MVP direction and prototype

Date: 2026-09-07.

## Scope and historical decisions retained

Reviewed the recent conversation, MVP scope, interactive prototype, and its existing browser checks. The project has an initialized Git repository without commits; there was no Android source, backend, dependency manifest, or live deployment to audit.

Retained: personal Android-first MVP; a path to iOS/web; immediate text/audio/image injecting logic; a separate in-session recording flow; later review; themes and subtle motion; future A/B/C protocol, transcription, and evidence-linked pattern analysis. Retained the user's requirement to learn core concepts during implementation.

Book influences remain The Disciplined Trader (Mark Douglas) and The Mental Game of Trading (Jared Tendler). Current reminder text is original example copy, not extracted book text.

## Completed review work

1. Reviewed local source and checked for an existing project graph. No graph existed; the project initially held only the scope document, so direct source review was appropriate.
2. Used systematic debugging and regression tests to reproduce failures before fixing them.
3. Requested an independent, read-only code review under the Superpowers review workflow.
4. Implemented bounded hardening of the existing browser prototype; did not scaffold or deploy the future app.
5. Saved the reviewed prototype and tests under `prototype/`, added security/performance requirements, and updated the MVP scope.

## Findings and corrections

| Finding | Correction | Evidence |
|---|---|---|
| Media copied into base64 strings and rendered attributes | Managed object URLs with explicit ownership, replacement, cancellation, and disposal | Browser checks for source references, retained URL counts, and 25 repeated replacements |
| Declared MIME trusted without checking actual media | Bounded header reads, recognized formats, decoder verification, duration and dimension limits | Invalid PNG/audio and enormous-dimension fixtures rejected |
| No aggregate attachment cap | 24 MB retained-media cap for this preview | Fourth 7 MB import rejected while three saved attachments remain |
| Timer survives preview removal | Root-removal/page lifecycle cleanup and canceled event listeners | Active recording interval count returns to zero after removal |
| Unbounded text and journal state | Field limits, 100 preview moments, short list summaries | Overlong save rejected; capacity reached without deleting previous entries |
| Theme helper rerender erases unsaved text | Apply design tokens without replacing current form | Unsaved note survives a host theme callback |
| Temporary hiding cleared saved audio source during hardening | Pause-only behavior for hiding/BFCache, full release only when appropriate | Hide/show and persisted pagehide retain the saved audio source |

Literal user text was already escaped. A rendering-injection regression confirms that a supplied HTML-like reminder stays text rather than creating an image or executing its handler.

## Verification

- Initial 13-case hardening suite: 1 passed, 12 failed on the original prototype. The failures were observed before corresponding fixes.
- A subsequent two-case audio-lifecycle regression reproduced the hide/resume bug (13 of 15 then passed).
- Final hardening suite: 17 of 17 passed in Chromium, including repeated imports and aggregate media capacity.
- Existing flow/layout suite passed at 320, 360, and 736 pixels, with light/dark themes, palette switching, editing, recording simulation, image/audio combinations, and reduced motion.
- Independent reviewer additionally checked overlapping uploads, canceled navigation, root removal during decode, and late callbacks in Chromium. No remaining important asynchronous ownership issue was reported; the reported audio lifecycle issue was fixed and covered by regressions.

These checks exercise the actual fragment. The optional host theme callback and lifecycle visibility states are controlled in tests; they do not simulate native Android memory behavior. There is no claim of an independent penetration test or proof of absolute security.

## Remaining release work

The future Android app still needs implementation and verification of actual microphone access, private/encrypted database and media storage, key recovery, backup rules, app unlock, safe exports/deletion, native memory profiling, dependency/build checks, and device testing. Any future backend needs a separate authorization and network review.

`SECURITY-AND-PERFORMANCE.md` makes these explicit MVP gates. Limits on the disposable prototype are not a substitute for paged on-device storage in the real application.

## Learning notes

- **Ownership:** every player, recording, timer, and media reference needs a clear owner that cleans it up.
- **Boundaries:** check input where it enters the app; filenames and MIME labels alone are not proof of content.
- **Working memory versus storage:** keep large media in files; keep only identifiers and currently needed metadata in working memory.
- **Security scope:** a private directory, an encrypted database, encrypted audio, and access control are distinct protections. Verify each one instead of calling the app fully secure.
- **Regression tests:** first reproduce a failure, then keep a test that catches its return.
