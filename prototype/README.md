# Interactive design prototype

`still-mobile-concept.html` is the reviewed source snapshot of the in-conversation concept. It is an HTML fragment intended for the preview host, not the Android application or a deployable production website. The host supplies icons and optional design controls. Browser tests can run the fragment independently; icons may be absent in standalone test screenshots.

Keep this source and the conversation copy synchronized when changing the design. The review tests read the source in this directory. Current conversation source:

`C:/Users/Rikesh/.codex/visualizations/2026/09/07/01a07bb0-34f4-7f22-bd4d-cf14aeb31f64/still-mobile-concept.html`

## Checks

Requires Node.js, Playwright, and its Chromium browser. The tests do not contact an application backend and use generated test media only. This is test tooling, not an app runtime dependency.

With Playwright available to Node:

```powershell
node prototype/check-hardening.cjs
node prototype/check-still.cjs
```

In this Codex workspace, the bundled runtime can be used without installing project dependencies:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\Users\Rikesh\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
& 'C:\Users\Rikesh\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' prototype/check-hardening.cjs
& 'C:\Users\Rikesh\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' prototype/check-still.cjs
```

- `check-hardening.cjs`: media validation and lifecycle, cleanup, input bounds, literal text rendering, theme draft preservation, journal capacity, aggregate media retention.
- `check-still.cjs`: emotion/capture/review flows, personal logic editing, uploaded image/audio combinations, narrow layouts, themes, reduced motion.
- Generated screenshots are ignored by Git.

The resource checks instrument real browser object-URL and interval APIs while still calling them. The optional host theme helper is represented by a test double only to trigger the actual application callback. These are targeted regressions, not a penetration test or Android memory benchmark.
