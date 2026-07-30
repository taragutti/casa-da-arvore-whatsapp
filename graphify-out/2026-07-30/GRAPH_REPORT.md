# Graph Report - CASA DA ARVORE FLUXO CRM  (2026-07-30)

## Corpus Check
- 60 files · ~30,669 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 362 nodes · 673 edges · 26 communities (20 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eff35cff`
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
- messageProcessing.service.ts
- email.service.ts
- messageProcessing.service.ts

## God Nodes (most connected - your core abstractions)
1. `logger` - 18 edges
2. `compilerOptions` - 14 edges
3. `env` - 13 edges
4. `processarHandoff()` - 13 edges
5. `runMonthlyBriefingJob()` - 12 edges
6. `processIncomingMessage()` - 12 edges
7. `What You Must Do When Invoked` - 12 edges
8. `Casa da Árvore — Automação Comercial e Inteligência de Demanda` - 11 edges
9. `processarMidiaProgressiva()` - 10 edges
10. `sendWhatsAppMessage()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `extractFromMessage()`  [EXTRACTED]
  scripts/test-extract.ts → src/services/anthropic.service.ts
- `processarHandoff()` --references--> `logger`  [EXTRACTED]
  src/services/messageProcessing.service.ts → src/config/logger.ts
- `processIncomingMessage()` --references--> `logger`  [EXTRACTED]
  src/services/messageProcessing.service.ts → src/config/logger.ts
- `runLifecycleFollowUpJob()` --calls--> `sendWhatsAppMessage()`  [EXTRACTED]
  src/jobs/lifecycleFollowUp.cron.ts → src/services/whatsapp.service.ts
- `runMonthlyBriefingJob()` --calls--> `sendBriefingEmail()`  [EXTRACTED]
  src/jobs/monthlyBriefing.cron.ts → src/services/email.service.ts

## Import Cycles
- None detected.

## Communities (26 total, 6 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.15
Nodes (19): env, envSchema, parsed, logger, checkDbConnection(), scheduleLifecycleFollowUpJob(), scheduleMonthlyBriefingJob(), connection (+11 more)

### Community 1 - "monthlyBriefing.cron.ts"
Cohesion: 0.19
Nodes (17): mesAnterior(), pad2(), periodoDeString(), PeriodoRange, runMonthlyBriefingJob(), DemandSignalRow, findDemandSignalsBetween(), markBriefingAsSent() (+9 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 3 - "anthropic.service.ts"
Cohesion: 0.14
Nodes (22): main(), MENSAGENS_DE_TESTE, extractFromMessage(), FormatoFesta15Anos, FORMATOS_15_ANOS, GatilhoEmocional, GATILHOS_EMOCIONAIS, getClient() (+14 more)

### Community 4 - "compilerOptions"
Cohesion: 0.09
Nodes (21): dist, ES2022, node_modules, src/**/*.test.ts, src/**/*.ts, compilerOptions, declaration, esModuleInterop (+13 more)

### Community 5 - "dependencies"
Cohesion: 0.11
Nodes (19): @anthropic-ai/sdk, bullmq, dotenv, express, ioredis, node-cron, pg, pino (+11 more)

### Community 6 - "devDependencies"
Cohesion: 0.06
Nodes (31): pino-pretty, tsx, @types/express, @types/node, @types/node-cron, @types/pg, typescript, description (+23 more)

### Community 7 - "scripts"
Cohesion: 0.12
Nodes (21): followUpQueue, atualizarTentativasSemClassificacao(), getEstadoHandoff(), marcarEmAtendimentoHumano(), getUltimaInteracao(), SinalEngajamento, agendarFollowUp(), DELAY_MS (+13 more)

### Community 8 - "Casa da Árvore — Automação Comercial e Inteligência de Demanda"
Cohesion: 0.11
Nodes (16): Ambientes e Credenciais — Casa da Árvore, Checklist de variáveis, Como manter isso útil, Pendência aberta, Pendência aberta — janela de 24h da Meta (notificação do vendedor), Briefing mensal (Etapa 7), Casa da Árvore — Automação Comercial e Inteligência de Demanda, Deploy (Etapa 9) (+8 more)

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

### Community 23 - "messageProcessing.service.ts"
Cohesion: 0.12
Nodes (30): startMessageWorker(), apenasPreenchidos(), EstadoHandoff, getEtapaMidiaAtual(), registrarEnvioMidia(), upsertConversationState(), buscarMidias(), AcaoMidia (+22 more)

### Community 24 - "email.service.ts"
Cohesion: 0.14
Nodes (22): buscarLeadsParaPainel(), LeadPainel, autenticarPainel(), compararSeguro(), painelRouter, RamoEvento, destinatarioHandoff(), enviarViaResend() (+14 more)

### Community 25 - "messageProcessing.service.ts"
Cohesion: 0.12
Nodes (24): pool, runLifecycleFollowUpJob(), insertDemandSignal(), adicionarTag(), arquivarLeadFrio(), buscarAniversariosCasamento(), buscarLeadsFriosParaArquivar(), buscarProspeccaoCorporativa() (+16 more)

## Knowledge Gaps
- **140 isolated node(s):** `name`, `version`, `description`, `private`, `type` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `logger` connect `server.ts` to `monthlyBriefing.cron.ts`, `anthropic.service.ts`, `scripts`, `messageProcessing.service.ts`, `email.service.ts`, `messageProcessing.service.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `env` connect `server.ts` to `monthlyBriefing.cron.ts`, `anthropic.service.ts`, `messageProcessing.service.ts`, `email.service.ts`, `messageProcessing.service.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _140 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14838709677419354 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `anthropic.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14130434782608695 - nodes in this community are weakly interconnected._