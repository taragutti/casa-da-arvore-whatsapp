# Graph Report - CASA DA ARVORE FLUXO CRM  (2026-08-01)

## Corpus Check
- 96 files · ~55,018 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 582 nodes · 1191 edges · 34 communities (28 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `074dc474`
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
- mediaEngine.service.ts
- email.service.ts
- messageProcessing.service.ts
- leads.repo.ts
- server.ts
- Onde paramos — 31/07/2026
- mediaLote.service.test.ts
- mediaEspera.service.test.ts
- midiasApi.test.ts
- messageProcessing.service.ts

## God Nodes (most connected - your core abstractions)
1. `logger` - 28 edges
2. `escapeHtml()` - 24 edges
3. `env` - 16 edges
4. `UnidadeRecomendada` - 15 edges
5. `processarHandoff()` - 14 edges
6. `compilerOptions` - 14 edges
7. `pool` - 13 edges
8. `processIncomingMessage()` - 13 edges
9. `runMonthlyBriefingJob()` - 12 edges
10. `What You Must Do When Invoked` - 12 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `extractFromMessage()`  [EXTRACTED]
  scripts/test-extract.ts → src/services/anthropic.service.ts
- `main()` --calls--> `buscarPorEmailComHash()`  [EXTRACTED]
  scripts/criar-usuario.ts → src/repositories/usuarios.repo.ts
- `main()` --calls--> `criarUsuario()`  [EXTRACTED]
  scripts/criar-usuario.ts → src/repositories/usuarios.repo.ts
- `main()` --calls--> `listarUsuarios()`  [EXTRACTED]
  scripts/criar-usuario.ts → src/repositories/usuarios.repo.ts
- `main()` --calls--> `hashSenha()`  [EXTRACTED]
  scripts/criar-usuario.ts → src/services/password.service.ts

## Import Cycles
- None detected.

## Communities (34 total, 6 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.08
Nodes (38): env, envSchema, parsed, PORT, logger, checkDbConnection(), comErro(), tratarErros() (+30 more)

### Community 1 - "monthlyBriefing.cron.ts"
Cohesion: 0.19
Nodes (18): mesAnterior(), pad2(), periodoDeString(), PeriodoRange, runMonthlyBriefingJob(), scheduleMonthlyBriefingJob(), DemandSignalRow, findDemandSignalsBetween() (+10 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 3 - "anthropic.service.ts"
Cohesion: 0.11
Nodes (27): main(), MENSAGENS_DE_TESTE, DadosPorRamo, extractFromMessage(), FormatoFesta15Anos, FORMATOS_15_ANOS, GatilhoEmocional, GATILHOS_EMOCIONAIS (+19 more)

### Community 4 - "compilerOptions"
Cohesion: 0.09
Nodes (21): dist, ES2022, node_modules, src/**/*.test.ts, src/**/*.ts, compilerOptions, declaration, esModuleInterop (+13 more)

### Community 5 - "dependencies"
Cohesion: 0.11
Nodes (19): @anthropic-ai/sdk, bullmq, dotenv, express, ioredis, node-cron, dependencies, @anthropic-ai/sdk (+11 more)

### Community 6 - "devDependencies"
Cohesion: 0.06
Nodes (32): description, devDependencies, pino-pretty, tsx, @types/express, @types/node, @types/node-cron, @types/pg (+24 more)

### Community 7 - "scripts"
Cohesion: 0.12
Nodes (32): startMessageWorker(), getEtapaMidiaAtual(), registrarEnvioMidia(), buscarMidias(), agendarFollowUp(), AcaoMidia, decidirProximaAcaoMidia(), enviarEtapaMidia() (+24 more)

### Community 8 - "Casa da Árvore — Automação Comercial e Inteligência de Demanda"
Cohesion: 0.10
Nodes (18): Ambientes e Credenciais — Casa da Árvore, Checklist de variáveis, Como manter isso útil, Pendência aberta, Templates de mensagem da Meta, Validade da mensagem (TTL), Volume de mídia (biblioteca de mídia, Seção 4), Briefing mensal (Etapa 7) (+10 more)

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

### Community 23 - "mediaEngine.service.ts"
Cohesion: 0.09
Nodes (32): main(), perguntar(), perguntarSenha(), rl, saida, SaidaSilenciavel, redisApp, autenticarBootstrap() (+24 more)

### Community 24 - "email.service.ts"
Cohesion: 0.09
Nodes (39): Autor, CategoriaMidia, TipoMidia, campoMinutos(), LABEL_UNIDADE, listaPalavras(), porExtenso(), REGUAS (+31 more)

### Community 25 - "messageProcessing.service.ts"
Cohesion: 0.11
Nodes (31): ReguaFollowUp, AtualizacaoConfig, Configuracoes, daLinha(), LinhaConfig, salvarConfiguracoes(), RamoEvento, buscarConfiguracoes (+23 more)

### Community 26 - "leads.repo.ts"
Cohesion: 0.10
Nodes (25): runLifecycleFollowUpJob(), scheduleLifecycleFollowUpJob(), TEMPLATES_CICLO_DE_VIDA, devolverAoBot(), inserirNota(), listarNotas(), adicionarTag(), arquivarLeadFrio() (+17 more)

### Community 28 - "server.ts"
Cohesion: 0.09
Nodes (33): buscarMidiaPorCodigo(), contarMidiasAtivasPorEtapa(), definirMidiaAtiva(), gerarProximoCodigo(), inserirMidia(), listarTodasMidias(), MediaItem, MediaItemAdmin (+25 more)

### Community 29 - "Onde paramos — 31/07/2026"
Cohesion: 0.17
Nodes (11): 1. Criar o primeiro usuário em produção (rápido, alta prioridade), 2. `media_library` está vazia (0 itens) — ferramenta pronta em 31/07, 3. Templates da Meta — conferir status, 4. WhatsApp do vendedor não ativado, Ambiente local, Decisões de arquitetura que não são óbvias no código, Escopo deliberadamente não implementado, Estado dos 9 estágios (+3 more)

### Community 30 - "mediaLote.service.test.ts"
Cohesion: 0.20
Nodes (7): agendarFollowUp, buscarMidias, enviarDocumento, enviarImagem, enviarTexto, getEtapaMidiaAtual, registrarEnvioMidia

### Community 31 - "mediaEspera.service.test.ts"
Cohesion: 0.25
Nodes (7): agendarFollowUp, buscarMidias, enviarImagem, enviarTexto, FOTO, getEtapaMidiaAtual, registrarEnvioMidia

### Community 32 - "midiasApi.test.ts"
Cohesion: 0.40
Nodes (3): DIRETORIO, FOTO, linhas

### Community 33 - "messageProcessing.service.ts"
Cohesion: 0.14
Nodes (22): pool, apenasPreenchidos(), atualizarTentativasSemClassificacao(), EstadoHandoff, marcarEmAtendimentoHumano(), upsertConversationState(), insertDemandSignal(), LeadNote (+14 more)

## Knowledge Gaps
- **198 isolated node(s):** `name`, `version`, `description`, `private`, `type` (+193 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `logger` connect `server.ts` to `messageProcessing.service.ts`, `monthlyBriefing.cron.ts`, `anthropic.service.ts`, `scripts`, `mediaEngine.service.ts`, `messageProcessing.service.ts`, `leads.repo.ts`, `server.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `pool` connect `messageProcessing.service.ts` to `monthlyBriefing.cron.ts`, `mediaEngine.service.ts`, `messageProcessing.service.ts`, `leads.repo.ts`, `server.ts`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `UnidadeRecomendada` connect `messageProcessing.service.ts` to `messageProcessing.service.ts`, `anthropic.service.ts`, `scripts`, `email.service.ts`, `leads.repo.ts`, `server.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _198 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08458646616541353 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `anthropic.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10685483870967742 - nodes in this community are weakly interconnected._