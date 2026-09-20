# Still — working product scope

Updated 2026-09-20. Working name; the Android application has not been built or deployed. The current deliverable is an interactive design prototype.

## Purpose and influences

A personal trading companion to notice emotional reactions, access personally meaningful injecting logic immediately, capture thoughts in the moment, and review them afterward.

Conceptual influences: The Disciplined Trader by Mark Douglas and The Mental Game of Trading by Jared Tendler. Starter reminders are original example copy, not quotations or claims of endorsement. Each user can replace them with their own words and media.

First user: Rikesh. Android first, with a planned path to iOS and web. Intended to become a live, maintained product after a working MVP.

## MVP

- Start and end trading sessions; group timestamped entries into a session timeline.
- Customizable emotion/urge buttons, including an unsure option and capture without a label.
- An emotion tap immediately displays its injecting logic and saves a timestamped journal entry for the selected emotion, without requiring a note, recording, or a separate Save action. A card supports text, personal audio, an image, or any combination. Audio is user-controlled; capturing a session voice note remains a separate action. Showing support must not wait for the journal write; a failed write must be reported without claiming the entry was saved.
- Edit personal support cards outside the trading moment. Add images and import or record personal reminder audio.
- Record, stop, save, and replay session voice notes; allow typed notes as an alternative.
- Recording is foreground-only in the MVP. Switching apps or locking the phone stops capture and preserves the captured portion; on return, show whether it was saved or still needs recovery/retry. Do not resume recording automatically. Verify this behavior on the target Android device, including abrupt interruptions.
- Review original entries and add separate retrospective reflections.
- Reliable offline storage, clear recording state, microphone permission handling, interruption handling, and recoverable errors. Preserve audio in durable app storage rather than cache.
- Data export/backup and deletion before depending on the app for ongoing personal use.
- A calm, minimal interface with large controls. Theme presets with light, dark, and system appearance; short icon/tap/screen transitions that respect reduced motion.
- Security and memory behavior are MVP requirements. Follow [SECURITY-AND-PERFORMANCE.md](SECURITY-AND-PERFORMANCE.md) for private/encrypted persistence, permission handling, lifecycle cleanup, bounded media processing, and physical-device release checks. These requirements are not yet implemented in an Android app.

## Design prototype capabilities and limitations

The inline prototype supports navigation, editable notes and injecting logic, local image/audio selection, theme switching, and simulated session recording. It keeps changes in memory for the preview only. It is not the Android app, durable storage, cloud sync, or a deployed service. Browser audio playback depends on the uploaded format and preview host support.

The prototype now validates media content and dimensions, uses managed object URLs, limits retained media and preview entries, releases resources on removal, and preserves unsaved fields during theme changes. Its limits protect a disposable preview; the production journal will use paged disk storage instead of a 100-entry cap. See the review report in `docs/reviews/2026-09-07-security-memory-review.md` for verification and remaining release work.

## Later versions

- A/B/C game protocol: define the user's own observable states and responses after further design and source review.
- Editable transcription while preserving original audio; explicit choice before cloud processing.
- Evidence-linked pattern suggestions that the user can confirm or reject.
- Preparation routines, personal early-warning signs, and reflection on following one's own rules.
- Expanded theme customization and accessibility settings based on actual use.
- Accounts, cross-device sync, iOS, and a web review workspace as needs develop.
- Further features driven by session data and user feedback rather than speculative dashboards.

## Engineering and learning approach

Provisional stack: React Native, Expo, TypeScript. Keep session data, support cards, media storage, and future analysis behind clear module boundaries. Plan storage and synchronization explicitly; sharing UI code does not remove platform differences.

Work in small demonstrable increments. Explain the problem, core concept, implementation, and verification for each increment. First implementation milestone: a real Android Record / Stop / Play screen, then reopening the app and replaying a persisted recording.

The theme system should use shared semantic design tokens (background, surface, text, accent, border) instead of colors scattered through individual screens. Motion should communicate feedback without delaying access to injecting logic.

## MVP acceptance and release direction

Personal trial success is a combination of noticing emotions earlier, pausing and following one's trading process, and capturing thoughts that help later review. Rikesh does not want a single outcome to exclude the others. Evaluate these together during the initial personal trial; completing a journal entry alone is not proof of emotional improvement.

- Emotion taps expose configured support immediately, without a required form.
- A successful emotion tap save records its emotion and tap timestamp even when no note or recording follows. Journal write failures do not block support and are visibly distinguished from saved entries.
- Text-only, audio-only, image-only, and combined support cards work.
- Voice recordings and session links survive closing and reopening the application.
- Permission denial, interruptions, and failed saves are clearly handled; never show a false successful save.
- Review distinguishes original capture from later reflection.
- All themes retain readable contrast; reduced motion works.
- Verify on a physical Android device. Trial during personal sessions, fix reliability issues, then prepare a limited live release.
- Select a release channel and any hosted services when implementation is ready. No deployment is requested or performed by this scope document.
