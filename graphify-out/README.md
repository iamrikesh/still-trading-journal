# Project navigation graph

Generated with the installed Graphify tool for the 2026-09-20 wrap-up: **228 nodes, 319 edges, 15 named communities**. This snapshot includes the handoff edits following app checkpoint `5ab68aa`. It is a navigation aid, not a statement that every planned feature is implemented.

- `graph.html`: interactive map; open in a browser. The renderer may need network access for its visualization library.
- `graph.json`: portable graph data with repository-relative source paths.
- `GRAPH_REPORT.md`: community names, central nodes, suggested questions and extraction audit.
- `manifest.json`: file fingerprints for incremental work.

Start future work with `docs/PROJECT-STATUS.md`, then use the graph to find relevant code and evidence:

```powershell
graphify query "createJournalController createEncryptedJournalOpener JournalRepository" --budget 1500
graphify explain "createEncryptedJournalOpener"
```

To refresh both code and documentation, ask Codex to use the Graphify skill on this repository. A plain code-only refresh does not re-interpret changed product/status documents. Honor `.graphifyignore` and `.gitignore`; do not index local tooling, generated native projects, dependency trees, screenshots or private journals. Do not start a watch service or automatic hook merely to resume work.

The initial corpus contained 41 supported files (~18,453 words): 24 code/configuration files and 17 documents. AST extraction supplied 185 nodes. Host-agent document extraction supplied 43 additional nodes, including explicit semantic coverage for `mobile/eas.json`, which produced no AST nodes. No external model API was used. Host-agent token usage was unavailable and is not claimed as zero.

## Known extraction limits

The raw AST output contains **31 import edges to 20 external module reference IDs without corresponding nodes** (React Native, Expo, Playwright and Node built-ins). The builder omits those edges. The undirected view also combines **two same-endpoint relationships**. These limits are recorded in the audit; inspect actual imports/call sites before using the map for dependency changes. There are no missing endpoint fields or self-loop edges.

Graphify's synthetic benchmark estimated 6.9x fewer tokens per query for its two example questions. Its corpus estimate differed from detection; this is a retrieval-size heuristic, not a measured guarantee of answer quality or future token savings.

The most connected project concepts include the current S20 checkpoint, release requirements, encrypted-journal initialization and the journal repository. Treat historical review nodes as dated evidence and future feature nodes as plans.


## 2026-09-21 limited planning refresh

Re-read PROJECT-STATUS.md and refreshed the existing checkpoint and voice-increment concept descriptions; regenerated the HTML view. Several clips per moment is the user-selected ownership model. Node/edge counts and architecture remain unchanged. All 20 host tests and TypeScript checking passed; no new phone or voice validation. This was a targeted host-agent documentation refresh, with no corpus scan, dependency indexing or model API calls; host token usage is unavailable. The original extraction audit above remains historical.


## Voice design draft added (2026-09-21)

Targeted host-agent extraction added the proposed S20 voice design and its explicit document references: 229 nodes and 321 edges. The original community analysis above is historical; this addition retains existing community assignments and does not recompute rankings. No dependency/private-data scan or external model API call was made; host token usage is unavailable. The design is for review, with native compatibility and implementation still unverified.


## Native encrypted-file milestone (2026-09-21)

Current navigation graph: **244 nodes, 340 edges**. Targeted host-agent extraction added native source/tests, development controller/panel, completed plan, Lesson 3 and dated S20 evidence. Relationships above are explicit source imports/calls/tests/document references; no external dependency trees, generated native output, local tools or private data were indexed. Host token usage unavailable; no external model API call. Existing community assignments were retained for navigation; historical centrality/cohesion tables above were not recomputed. Voice recording and general file/SQLite recovery remain unimplemented.
