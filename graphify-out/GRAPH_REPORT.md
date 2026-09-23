# Graph Report - .  (2026-09-20)

## Corpus Check
- Corpus is ~18,453 words - fits in a single context window. You may not need a graph.

## Summary
- 228 nodes · 319 edges · 15 communities (14 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.9)
- Token cost: unavailable for host-agent semantic extraction (the host does not expose separate usage). AST extraction made no model calls.

## Community Hubs (Navigation)
- Project status and roadmap
- Encrypted journal persistence
- Runtime dependencies
- Development commands
- Prototype media hardening
- Emotion UI and state
- Android app permissions
- Expo app configuration
- TypeScript configuration
- Development dependencies
- APK packaging verification
- Prototype browser checks
- Prototype preview server

## God Nodes (most connected - your core abstractions)
1. `Current S20 development checkpoint` - 13 edges
2. `Security and memory release requirements` - 12 edges
3. `expo` - 11 edges
4. `scripts` - 11 edges
5. `createEncryptedJournalOpener()` - 11 edges
6. `JournalRepository` - 11 edges
7. `Working MVP scope` - 10 edges
8. `still. project overview` - 10 edges
9. `Android build and device evidence` - 9 edges
10. `EncryptionDependencies` - 7 edges

## Surprising Connections (you probably didn't know these)
- `still. project overview` --references--> `EAS build profiles`  [EXTRACTED]
  README.md → mobile/eas.json
- `EAS build profiles` --conceptually_related_to--> `Portfolio and release roadmap`  [INFERRED]
  mobile/eas.json → README.md
- `Bounded resource ownership` --semantically_similar_to--> `Prototype object URL lifecycle`  [INFERRED] [semantically similar]
  SECURITY-AND-PERFORMANCE.md → prototype/still-mobile-concept.html
- `Asynchronous save state` --semantically_similar_to--> `Prototype bounded media validation`  [INFERRED] [semantically similar]
  docs/learning/01-first-moment.md → prototype/still-mobile-concept.html
- `Prototype guide and checks` --references--> `Historical prototype security and memory review`  [INFERRED]
  prototype/README.md → docs/reviews/2026-09-07-security-memory-review.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Learning increment: runnable behavior, exercise and verification** — mvp_scope_learning_increments, docs_learning_01_first_moment_first_moment_lesson, docs_learning_02_android_device_build_android_build_lesson, docs_superpowers_plans_2026_09_20_first_android_increment_first_increment_plan [EXTRACTED 1.00]

## Communities (15 total, 1 thin omitted)

### Community 0 - "Project status and roadmap"
Cohesion: 0.09
Nodes (43): Continuation instructions, Prepared app checks workflow, Asynchronous save state, Lesson 1: tap to saved moment, Journal repository boundary, Lesson 2: physical Android development, Metro over USB IPv4, Short-path Windows build workflow (+35 more)

### Community 1 - "Encrypted journal persistence"
Cohesion: 0.11
Nodes (16): createEncryptedJournalOpener(), EncryptedDatabase, EncryptionDependencies, createMemoryJournal(), keyOptions, openEncrypted, openJournal(), demo (+8 more)

### Community 2 - "Runtime dependencies"
Cohesion: 0.06
Nodes (31): expo, expo-constants, expo-crypto, expo-dev-client, expo-file-system, @expo/metro-runtime, expo-secure-store, expo-sqlite (+23 more)

### Community 3 - "Development commands"
Cohesion: 0.09
Nodes (21): engines, node, main, name, overrides, xcode, private, scripts (+13 more)

### Community 4 - "Prototype media hardening"
Cohesion: 0.12
Nodes (10): assert, { chromium }, fragment, fs, path, png, test(), tests (+2 more)

### Community 5 - "Emotion UI and state"
Cohesion: 0.23
Nodes (10): App(), JournalApp(), makeStyles(), createJournalController(), JournalState, Emotion, emotions, isTemporaryJournal (+2 more)

### Community 6 - "Android app permissions"
Cohesion: 0.14
Nodes (14): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, allowBackup, blockedPermissions, package (+6 more)

### Community 7 - "Expo app configuration"
Cohesion: 0.14
Nodes (13): expo, icon, ios, name, orientation, plugins, slug, userInterfaceStyle (+5 more)

### Community 8 - "TypeScript configuration"
Cohesion: 0.20
Nodes (9): compilerOptions, allowImportingTsExtensions, noUncheckedIndexedAccess, strict, types, extends, expo/tsconfig.base, node (+1 more)

### Community 9 - "Development dependencies"
Cohesion: 0.22
Nodes (9): devDependencies, @playwright/test, @types/node, @types/react, typescript, @playwright/test, @types/node, @types/react (+1 more)

### Community 10 - "APK packaging verification"
Cohesion: 0.50
Nodes (3): abis, apk, entries

### Community 11 - "Prototype browser checks"
Cohesion: 0.50
Nodes (3): { chromium }, fs, path

## Knowledge Gaps
- **85 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+80 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo` connect `Expo app configuration` to `Android app permissions`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `expo-secure-store` connect `Expo app configuration` to `Encrypted journal persistence`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _85 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project status and roadmap` be split into smaller, more focused modules?**
  _Cohesion score 0.08527131782945736 - nodes in this community are weakly interconnected._
- **Should `Encrypted journal persistence` be split into smaller, more focused modules?**
  _Cohesion score 0.11379800853485064 - nodes in this community are weakly interconnected._
- **Should `Runtime dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `Development commands` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
## Checkpoint and limitations

Built for the 2026-09-20 wrap-up following device checkpoint `5ab68aa`, including the accompanying handoff edits. Read `docs/PROJECT-STATUS.md` for current completion and remaining work. Historic reviews describe earlier checkpoints.

Scope: application/prototype source and project documentation; dependencies, tools, generated native projects, private data and images are excluded. `mobile/eas.json` had no AST nodes and is covered semantically. Semantic relationships were extracted by the host agent; inspect source before relying on inferred relationships.

### Extraction integrity

```text
[graphify] MultiDiGraph edge-collapse diagnostic
input: <in-memory>
input_stage: provided JSON (normal graph.json is post-build)
effective_directed: <direct-call>
nodes: 228
unverified_code_nodes: 0
raw_edges: 352
valid_candidate_edges: 321
missing_endpoint_edges: 0
dangling_endpoint_edges: 31
self_loop_edges: 0
exact_duplicate_edges: 0
directed_unique_endpoint_pairs: 320
directed_same_endpoint_collapsed_edges: 1
undirected_unique_endpoint_pairs: 319
undirected_same_endpoint_collapsed_edges: 2
same_endpoint_group_count: 1
relation_variant_groups: 1
source_file_variant_groups: 0
source_location_variant_groups: 0
context_variant_groups: 0
post_build_graph_type: Graph
post_build_edges: 319
producer_suppression_sites: 11
producer_suppression_examples:
  - L1125 seen_ids arity=unknown
  - L1391 seen_ids arity=unknown
  - L1393 seen_doc_refs arity=unknown
  - L1753 seen_ids arity=unknown
  - L2243 seen_keys arity=unknown
  - L2412 seen_keys arity=unknown
  - L3818 seen_ids arity=unknown
  - L3926 seen_ids arity=unknown
examples:
  - mobile_index -> mobile_app_app edges=2 relations=['imports', 'indirect_call'] locations=['L3', 'L8'] contexts=['argument', 'import']
note: normal graph.json is post-build; raw producer loss must be measured earlier.
```


## 2026-09-21 limited planning refresh

Re-read PROJECT-STATUS.md and refreshed the existing checkpoint and voice-increment concept descriptions; regenerated the HTML view. Several clips per moment is the user-selected ownership model. Node/edge counts and architecture remain unchanged. All 20 host tests and TypeScript checking passed; no new phone or voice validation. This was a targeted host-agent documentation refresh, with no corpus scan, dependency indexing or model API calls; host token usage is unavailable. The original extraction audit above remains historical.


## Voice design draft added (2026-09-21)

Targeted host-agent extraction added the proposed S20 voice design and its explicit document references: 229 nodes and 321 edges. The original community analysis above is historical; this addition retains existing community assignments and does not recompute rankings. No dependency/private-data scan or external model API call was made; host token usage is unavailable. The design is for review, with native compatibility and implementation still unverified.


## Native encrypted-file milestone (2026-09-21)

Current navigation graph: **244 nodes, 340 edges**. Targeted host-agent extraction added native source/tests, development controller/panel, completed plan, Lesson 3 and dated S20 evidence. Relationships above are explicit source imports/calls/tests/document references; no external dependency trees, generated native output, local tools or private data were indexed. Host token usage unavailable; no external model API call. Existing community assignments were retained for navigation; historical centrality/cohesion tables above were not recomputed. Voice recording and general file/SQLite recovery remain unimplemented.


## Host clip recovery increment (2026-09-21)

Current navigation graph: **252 nodes, 352 edges**. Targeted host-agent extraction added the opt-in repository, migration, contracts, integration tests, synthetic fixture helper, plan, lesson and evidence. Imports/tests/document references were checked against current files. No dependencies, generated native output, local tools or private data were scanned. No external model API call; host token usage unavailable. Existing communities retained; historical centrality/cohesion tables were not recomputed. Host file fixtures are noncryptographic; Android integration and voice recording remain unimplemented.


## Native clip integration (2026-09-21)

Current navigation graph: **266 nodes, 376 edges**. Targeted host-agent extraction covers inspected native/session source, tests, plan, lesson, dated evidence and session wrap-up. The wrap-up records the published f9e1587 checkpoint, stopped development server and next Record/Stop/Play increment. Existing module/keyset descriptions were updated. No dependency, generated native output, local tool or private-data scan; no external model API call, host token usage unavailable. Existing communities retained; historical centrality/cohesion tables were not recomputed. The graph navigates evidence; it does not certify security or microphone behavior.


## Recording lifecycle increment (2026-09-22)

Targeted inspected-source refresh: **281 nodes / 395 edges**. Includes recording control, native lifecycle source/tests, permission migration, plan, lesson and dated evidence. Existing communities retained; historical centrality/cohesion not recomputed. No dependencies, generated Android output, local tools or private data scanned. No external model API call; host token cost unavailable. This graph is navigation, not security or device-validation evidence.


## Device lifecycle evidence (2026-09-23)

Targeted public-document refresh: **282 nodes / 399 edges**. Added the dated S20 check record and explicit status/lesson references; updated the current checkpoint. Existing communities and historical cohesion/centrality remain unchanged. No corpus, dependency, generated-native, local-tool or private-data scan; no external model API call. Host token cost is unavailable. No dangling endpoints in the saved graph; historical extraction limits above remain. Device evidence is bounded as recorded in the review.


## Resource-cycle evidence (2026-09-23)

Targeted public-document refresh: **283 nodes / 402 edges**. Added resource-cycle evidence and explicit status/lesson/review references. Communities and historical cohesion/centrality retained. No corpus, dependency, generated-native, local-tool or private-data scan; no external model API call. Host token cost unavailable. No dangling endpoints in the saved graph; historical extraction limitations above remain. The review separates cleanup evidence from limited memory measurements.


## Longer memory baseline (2026-09-23)

Targeted public-document refresh: **284 nodes / 405 edges**. Added the memory-baseline review and explicit document references; current checkpoint and lesson descriptions updated. Existing communities and historical cohesion/centrality retained. No corpus, dependency, generated-native, local-tool or private-data scan; no external model API call. Host token cost unavailable. Saved graph endpoints are valid; historical extraction limitations remain. Read the review for measured scope, not a production-readiness inference.


## Permission-start cancellation (2026-09-23)

Targeted refresh of reviewed public source/document relationships: **285 nodes / 409 edges**. Added the dated evidence and updated controller/runtime/checkpoint descriptions. Existing communities and historical centrality retained; no full structural re-extraction. No dependency, generated-native, local-tool or private-data scan, and no external model API call. Host token cost unavailable. Current source, tests and dated evidence take precedence over navigation metadata.


## Journal features design milestone (2026-09-23)

Targeted public-document refresh: **287 nodes / 412 edges**. Added the milestone tracker and agreed glossary; refreshed the current-checkpoint description. This records design discovery, not implemented features. Existing communities and historical centrality retained; no full structural extraction or private/dependency/native-output scan. No external model API call; host token cost unavailable.
