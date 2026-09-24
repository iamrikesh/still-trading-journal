# UI/UX discovery — 24 September 2026

Rikesh has prioritised UI/UX before further feature or release-gate work and selected **calm and minimal: clearer actions, less clutter**. This is a research checkpoint, not an approved screen specification or implemented redesign.

## Evidence inspected

- Clean branch `codex/android-device-setup` at `3c05213`; implementation remains `c68e85b`.
- Current project status and September24 reminders/history review; existing graph used to find screen and theme relationships, then verified against source.
- The retained September24 16:14 S20 Now screenshot and current `mobile/App.tsx`, `theme.ts`, `TradingPanel.tsx`, `WritingPanel.tsx`, and `ReminderEditor.tsx`. Screenshot inspection was local; no phone interaction or new device acceptance occurred.
- Public upstream skill repositories, current Expo documentation and skills.sh listings. Listings show adoption, not evidence that a skill produces better results for this app. Catalog summaries can lag upstream source.

## Toolset recommendation

| Resource | Purpose for still. | Fit and limits |
| --- | --- | --- |
| [Expo official skills](https://github.com/expo/skills) | `expo-overview`, `expo-native-ui`, `expo-design-system`; consult `expo-ui` for relevant controls | Best implementation fit for Expo/React Native. Shared typography, spacing, component states and Android conventions. Apply against SDK57 documentation and existing native modules; a skill does not justify migrating navigation or adding packages by itself. |
| [Impeccable](https://github.com/pbakaus/impeccable) | Shape, critique, simplify, clarify and audit the design | Recommended design-review partner. Upstream includes native audit guidance. Browser inspection cannot validate the S20; its current launcher may download a binary. Source inspected, launcher not executed. |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Optional palette, typography and pattern exploration | Includes React Native guidance and a searchable catalog. Explicitly select the native stack; its default is HTML/Tailwind. An input to judgement, not the authority for this product's workflow. |
| [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | Alternative visual-direction guidance | Useful for distinctive composition; web-oriented and overlaps with Impeccable. Not necessary alongside the recommended pair initially. |

The [Expo skill documentation](https://docs.expo.dev/skills/) confirms official support. The [Impeccable](https://www.skills.sh/pbakaus/impeccable), [frontend-design](https://www.skills.sh/anthropics/skills/frontend-design) and [UI UX Pro Max](https://www.skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max) listings establish visible community adoption; installation counts are not quality rankings.

Existing brainstorming and verification skills support the process. Existing visualization/browser capabilities can support synthetic mockups. Image generation is optional for genuine artwork, not required for layouts or icons. Figma is optional if an editable external design file becomes useful; no service connection is needed for this first pass. No new skills/plugins were installed in this research increment.

## Initial UX findings

1. **Now prioritises introduction over repeated use.** The saved S20 screenshot shows the large heading and explanatory copy taking much of the upper screen. Only four reminder cards are fully visible; other cards and actions require scrolling.
2. **Frequent actions are below configuration entry points.** Source places Start session and Write note after the card grid and Manage reminder buttons. Appearance and development exercises continue the same scroll.
3. **Editors mix tasks.** Reminder editing begins with global appearance controls, then several text fields and media sections; Save/Cancel are at the bottom. This is a source-based reachability concern, not a freshly reproduced keyboard defect.
4. **Session reading competes with maintenance.** Session details expose title/time correction and archive controls alongside the timeline. Reading and reflection should lead; corrections can be a deliberate secondary action.
5. **History navigation is distant.** Older/Newest controls are in the list footer. The previous acceptance review established pagination correctness; that does not establish convenient navigation.
6. **Visual rules are scattered.** A shared colour palette exists, but screens repeat different type sizes, button shapes and spacing. A small reusable design system would make the calmer direction consistent.

## Proposed next increment

First produce comparable synthetic mockups of **Now → reminder → note**, including an active session and the keyboard-open writing state. Keep the calm tone; shorten the introduction, expose frequent actions, and provide a separate home for appearance/reminder management. Compare a compact card layout with a simple list layout before choosing one.

Then implement the selected flow in a small increment, preserving one-tap timestamped capture, immutable historical words, draft recovery, explicit audio playback and global recovery access. Carry the agreed components into history, session detail and reminder editing afterward. Keep existing storage/native boundaries unless a concrete design need requires otherwise.

Validation should include the primary task on the S20, Android Back, keyboard reachability, long labels, large system text, light/dark appearance and meaningful failure/retry states. Android recommends [touch targets of at least 48 × 48 dp](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views). Measure actual rendered targets; do not infer accessibility from style declarations alone.

## Learning and resume

UI is the visual presentation; UX is the effort required to complete a task. Exercise: on Now, identify the first action you would take to capture a feeling and the first action you would take to write a note. Which is immediately discoverable, and which requires searching?

Resume here and in PROJECT-STATUS.md. Direction is chosen; detailed layouts, tool installation and screen design approval remain open. App source, dependencies, device data and release gates are unchanged. No tests were rerun because this increment changed only research/navigation documentation.
