# First Android increment implementation plan

> Execute the tightly coupled app foundation inline, with independent code review before publishing. User authorized starting implementation on settled decisions, learning by doing, and a public portfolio repository on 2026-09-20.

## Goal and scope

Build the first React Native/Expo/TypeScript increment: choose an emotion, immediately read original starter injecting logic, save the tap timestamp, and see recent moments. Native saved history must persist in an encrypted SQLite database with a device-protected key. A browser preview uses temporary in-memory sample data; it is not the private journal. No voice capture, imported media, backup, app authentication or production security claim in this increment.

Spec: `MVP-SCOPE.md` and `SECURITY-AND-PERFORMANCE.md`. This is one learning increment toward their full MVP, not an attempt to complete every feature at once.

## Decisions and constraints

- Work on `codex/mvp-foundation` in the existing, initially uncommitted checkout. Keep the original prototype and documentation intact.
- Use the current stable Expo template and SDK-compatible dependencies; record resolved versions in the lockfile.
- Treat moments as ungrouped until session behavior is selected. This is a reversible implementation default, not a settled product decision.
- Native encryption must fail closed if SQLCipher is unavailable. Expo Go and web may show an explicitly temporary demo; never silently write an unencrypted native journal.
- Keep support usable when storage is unavailable. Show saving, saved and failed states honestly; retry preserves the original moment ID and timestamp.
- No private journal text, recordings, secrets, machine-specific paths or credentials in GitHub.
- Test user-visible behavior and the journal repository, not private helpers or framework mechanics.
- Target learner: has some JavaScript experience; testing phone: Samsung S20.

## Task 1: Runnable foundation and first moment

Files: `mobile/package.json`, `mobile/App.tsx`, `mobile/src/journal/*`, `mobile/src/storage/*`, `mobile/src/theme.ts`, `mobile/tests/*`, app configuration.

- [x] Generate a blank TypeScript Expo application under `mobile/`; install compatible SQLite, secure storage, random ID, safe-area, development-client and web dependencies.
- [x] Define `Moment` with `id`, `emotionId`, `emotionLabel`, `createdAt` and original `supportText`. Define a repository with `save(moment)`, `list()` and `remove(id)`; list is bounded to 50 recent rows.
- [x] Write and observe a failing behavioral test: tapping FOMO exposes support immediately while an unresolved save remains pending. Test failure and retry without inventing another moment or timestamp.
- [x] Implement the smallest controller and UI needed to pass. Preserve original injecting logic in the recorded moment. Never delay the support card for storage initialization.
- [x] Write repository integration tests against real SQLite: save/reopen/list, parameterized unusual text, idempotent retry, newest-first ordering, bounded results, and deletion.
- [x] Implement parameterized SQLite persistence and native SQLCipher/SecureStore initialization. Check cipher availability; protect generated keys; do not overwrite history when a key fails.
- [x] Add a bounded in-memory web/Expo Go demonstration with explicit temporary status and no personal-text entry.
- [x] Run type checking, meaningful tests, dependency compatibility checks, and Android/web bundle generation. Subsequent native setup and S20 save/restart/delete/SQLCipher checks are complete; see `docs/reviews/2026-09-20-android-build-setup.md` for the later evidence.

## Task 2: Learning and portfolio delivery

Files: `README.md`, `docs/learning/01-first-moment.md`, `docs/ci/checks.yml`, `.gitignore`, implementation evidence.

- [x] Explain React components, state, TypeScript, persistence, asynchronous save states, and test-first development using this increment's real files.
- [x] Provide PowerShell-safe commands (`npm.cmd`, `npx.cmd`), a small exercise, and its expected visible result.
- [x] Document current capabilities and remaining native/privacy/recovery/release gates honestly.
- [x] Prepare a continuous integration workflow for clean install, type checking, tests and bundling; check secrets and tracked-file selection.
- [ ] Activate CI after the GitHub credential is granted workflow scope. Keep the complete workflow in `docs/ci/checks.yml` until then. Publishing the requested portfolio source does not depend on broadening the credential.
- [x] Obtain independent review; fix material findings and repeat affected tests.
- [x] Create local commits using verified GitHub identity; create public `iamrikesh/still-trading-journal` and push the reviewed project. No paid services or store publication in this increment.

## Following increments

Real Record/Stop/Play and foreground interruption handling; encrypted media and recovery proof; editable multimedia injecting logic; session grouping and reflections; backup/restore and deletion; physical-device privacy and memory testing; signed personal test release, then public distribution and portfolio walkthrough.

Each increment includes the problem, one core concept, a runnable result, a learner exercise and verification evidence.
