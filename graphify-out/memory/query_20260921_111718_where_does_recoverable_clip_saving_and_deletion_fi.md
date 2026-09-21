---
type: "query"
date: "2026-09-21T11:17:18.489940+00:00"
question: "Where does recoverable clip saving and deletion fit in still?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["sqlJournal.ts", "Recoverable encrypted media commit"]
---

# Q: Where does recoverable clip saving and deletion fit in still?

## Answer

Expanded graph vocabulary: recoverable deletion sqljournal vault. BFS points to Recoverable encrypted media commit in SECURITY-AND-PERFORMANCE.md, sqlJournal.ts at L1, createSqlJournal at L9 and the native proof module. Current source confirms schema 1 directly deletes moments and the debug module only handles synthetic encryption checks. The approved voice design requires an opt-in coordinator for durable clip intents, verified file commit, cleanup and deletion before connecting microphone recording. Graph is navigation; host recovery work and Android integration have distinct evidence.

## Outcome

- Signal: useful

## Source Nodes

- sqlJournal.ts
- Recoverable encrypted media commit