# MVP plan review

Status: discussion in progress; this is a review of the existing plan, not an approved replacement specification.

## Evidence and retained direction

Reviewed `MVP-SCOPE.md`, `SECURITY-AND-PERFORMANCE.md`, the previous review, and the prototype source. An independent read-only review found unresolved product decisions rather than direct contradictions between the planning documents.

The repository contains a browser design prototype and checks. It does not yet contain a React Native application. Prototype recording is simulated, and entries are held in memory. Previous browser test results are historical evidence; this review did not rerun them or establish native Android behavior.

Retain the personal Android-first direction: notice an emotion or urge, access personalized injecting logic immediately, optionally capture voice or text, and reflect later. Support cards allow text, audio, images, or combinations. Preserve capture without knowing an emotion label. Preserve minimalist themes, accessible optional motion, and learning during development.

The current plan proposes offline operation, encrypted durable storage, recovery/export and deletion. Transcription, pattern analysis, A/B/C protocol, accounts, sync, iOS and web remain later work.

## First decision round

1. Confirmed by Rikesh: an emotion tap saves its timestamp and shows its injecting logic. Notes and recordings remain optional. Updated the MVP scope to require the selected emotion and tap timestamp without a separate Save action. Immediate support must remain available if persistence fails; the app must distinguish a failed save from a saved moment. Accidental-tap undo behavior remains to be designed.
2. Confirmed by Rikesh: switching apps or locking the phone stops recording and preserves the captured portion; show its status when returning. Updated scope and security requirements. Native lifecycle behavior remains unimplemented and must be proven on the target phone.
3. Confirmed by Rikesh: success can be all or any combination of earlier emotion recognition, pausing/following one's process, and useful capture/review. Do not force a single primary outcome. Assess these together during the trial without assuming usage counts demonstrate benefit.

## Second decision round — pending

- Whether a first emotion tap may automatically start a session when none is active, so an explicit Start Session action is not required to access support.
- Whether password-protected manual backup/restore is acceptable for the offline MVP, or automatic cloud backup is essential from the first usable version.

## Subsequent decisions and engineering gaps

- Trading context: same phone as the trading platform, separate device, or desktop trading; phone model and Android version.
- Sessions: access without an active session, automatic grouping, repeated taps, forgotten session end, and entries spanning midnight. Session administration must not delay support.
- History: whether review retains the support content seen at the time after a support card is edited or deleted.
- Capture behavior: calls, low space, failed saves, maximum duration, switching between reminder playback and recording, and crash recovery. Define what is recoverable rather than promise zero audio loss.
- Privacy and recovery: acceptable unlock grace period, screenshots, export destination, backup password/key ownership, and restoring onto a replacement phone.
- Prove the recovery design alongside encryption selection; the export interface may be implemented later without deferring this prerequisite.
- Release: distinguish a signed personal/internal test build from a public store release.
- Learning: establish current JavaScript/TypeScript/Git experience and the balance of explanations versus guided exercises.

## Skill sequence and outputs

1. `grill-me` / `grilling`: resolve product decisions in rounds using the existing work as context.
2. `setup-matt-pocock-skills`: establish where specs and tickets live. No Git remote is configured at review time; local Markdown is a proposed starting point, not a selected tracker.
3. `to-spec`: synthesize settled decisions, observable behavior, acceptance criteria, and exclusions into the MVP specification.
4. `to-tickets`: propose small end-to-end increments and their dependencies, then record the agreed breakdown.
5. `tdd`: implement each increment through agreed observable interfaces and meaningful failing tests, then verify on the real device where necessary.
6. `codebase-design` and `improve-codebase-architecture`: guide responsibilities and inspect actual structural friction as the native code grows. The browser prototype is not evidence that the native architecture is already implemented.

For each implementation increment, explain the problem, one core concept, the change, and how we know it works. Security and memory claims require measurements and tests, not merely these documents.
