# Graph Report - CASA DA ARVORE FLUXO CRM  (2026-07-25)

## Corpus Check
- 43 files · ~20,263 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 256 nodes · 370 edges · 23 communities (17 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dd86bd2b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.ts
- monthlyBriefing.cron.ts
- What You Must Do When Invoked
- anthropic.service.ts
- compilerOptions
- dependencies
- devDependencies
- scripts
- Casa da Árvore — Automação Comercial e Inteligência de Demanda
- graphify reference: extra exports and benchmark
- graphify reference: query, path, explain
- migrate.js
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- anthropic.service.test.ts
- CLAUDE.md
- CLAUDE.md
- extraction-spec.md

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 14 edges
2. `logger` - 12 edges
3. `runMonthlyBriefingJob()` - 12 edges
4. `What You Must Do When Invoked` - 12 edges
5. `env` - 11 edges
6. `Casa da Árvore — Automação Comercial e Inteligência de Demanda` - 11 edges
7. `/graphify` - 10 edges
8. `scripts` - 9 edges
9. `sanitize()` - 8 edges
10. `extractFromMessage()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `extractFromMessage()`  [EXTRACTED]
  scripts/test-extract.ts → src/services/anthropic.service.ts
- `start()` --calls--> `scheduleMonthlyBriefingJob()`  [EXTRACTED]
  src/server.ts → src/jobs/monthlyBriefing.cron.ts
- `extractFromMessage()` --calls--> `extractJsonPayload()`  [EXTRACTED]
  src/services/anthropic.service.ts → src/utils/json.ts
- `processIncomingMessage()` --calls--> `extractFromMessage()`  [EXTRACTED]
  src/services/messageProcessing.service.ts → src/services/anthropic.service.ts
- `start()` --calls--> `checkDbConnection()`  [EXTRACTED]
  src/server.ts → src/db/client.ts

## Import Cycles
- None detected.

## Communities (23 total, 6 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.13
Nodes (25): env, envSchema, parsed, logger, checkDbConnection(), pool, connection, MessageJobData (+17 more)

### Community 1 - "monthlyBriefing.cron.ts"
Cohesion: 0.17
Nodes (20): mesAnterior(), pad2(), periodoDeString(), PeriodoRange, runMonthlyBriefingJob(), scheduleMonthlyBriefingJob(), DemandSignalRow, findDemandSignalsBetween() (+12 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 3 - "anthropic.service.ts"
Cohesion: 0.12
Nodes (24): main(), MENSAGENS_DE_TESTE, DadosPorRamo, extractFromMessage(), FormatoFesta15Anos, FORMATOS_15_ANOS, GatilhoEmocional, GATILHOS_EMOCIONAIS (+16 more)

### Community 4 - "compilerOptions"
Cohesion: 0.09
Nodes (21): dist, ES2022, node_modules, src/**/*.test.ts, src/**/*.ts, compilerOptions, declaration, esModuleInterop (+13 more)

### Community 5 - "dependencies"
Cohesion: 0.11
Nodes (19): @anthropic-ai/sdk, bullmq, dotenv, express, ioredis, node-cron, pg, pino (+11 more)

### Community 6 - "devDependencies"
Cohesion: 0.12
Nodes (17): pino-pretty, tsx, @types/express, @types/node, @types/node-cron, @types/pg, typescript, devDependencies (+9 more)

### Community 7 - "scripts"
Cohesion: 0.13
Nodes (14): description, name, private, scripts, briefing, build, dev, migrate (+6 more)

### Community 8 - "Casa da Árvore — Automação Comercial e Inteligência de Demanda"
Cohesion: 0.12
Nodes (15): Ambientes e Credenciais — Casa da Árvore, Checklist de variáveis, Como manter isso útil, Pendência aberta, Briefing mensal (Etapa 7), Casa da Árvore — Automação Comercial e Inteligência de Demanda, Deploy (Etapa 9), Logs (Etapa 8) (+7 more)

### Community 9 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 10 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 11 - "migrate.js"
Cohesion: 0.40
Nodes (3): fs, path, { Pool }

### Community 12 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 13 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 14 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

## Knowledge Gaps
- **125 isolated node(s):** `name`, `version`, `description`, `private`, `type` (+120 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `scripts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `scripts`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `logger` connect `server.ts` to `monthlyBriefing.cron.ts`, `anthropic.service.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _125 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1294871794871795 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `anthropic.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12307692307692308 - nodes in this community are weakly interconnected._